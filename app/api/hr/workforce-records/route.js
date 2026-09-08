export const dynamic = "force-dynamic";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import {
  getSessionOfficeFilter,
  resolveEmployeeManagementSession,
  sessionAllowsOffice,
} from "@/lib/employee-access";
import { getLocalOfficeRecord } from "@/lib/postgres/attendance-store";
import { findOfficeDivision } from "@/lib/offices";
import { createOriginGuard } from "@/lib/csrf";
import { SafeRequestError, serverErrorResponse } from "@/lib/http/server-error";
import { queryPostgres, withPostgresTransaction } from "@/lib/postgres/client";
import { auditActorFromSession, writeAuditLog } from "@/lib/audit-log";
import {
  LEAVE_TYPES,
  normalizeWeeklySchedule,
  philippineHolidaySeed,
} from "@/lib/workforce-policy";

const RECORDS = {
  holiday: { table: "holidays", id: "id" },
  leave: { table: "employee_leaves", id: "id" },
  order: { table: "official_orders", id: "id" },
  policy: { table: "workforce_policies", id: "id" },
};

function text(value) {
  return String(value || "").trim();
}
function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(text(value));
}

async function loadRecord(type, id) {
  if (type === "leave")
    return (
      (await queryPostgres("SELECT * FROM employee_leaves WHERE id = $1", [id]))
        .rows[0] || null
    );
  if (type === "order")
    return loadOrderRecord(id);
  if (type === "holiday")
    return (
      (await queryPostgres("SELECT * FROM holidays WHERE id = $1", [id]))
        .rows[0] || null
    );
  return (
    (
      await queryPostgres("SELECT * FROM workforce_policies WHERE id = $1", [
        id,
      ])
    ).rows[0] || null
  );
}

async function auditWorkforce(
  session,
  { action, type, id, officeId = "", before = null, after = null, summary },
) {
  await writeAuditLog(null, {
    actorRole: session.role,
    actorScope: session.scope,
    actorOfficeId: session.officeId,
    ...auditActorFromSession(session),
    action: `workforce.${action}`,
    targetType: `workforce_${type}`,
    targetId: id,
    officeId,
    summary: summary || `${action} ${type}`,
    metadata: { before, after },
  });
}

async function hasRangeConflict(
  table,
  personId,
  startDate,
  endDate,
  excludeId = "",
) {
  const result = await queryPostgres(
    `SELECT id FROM ${table} WHERE person_id = $1 AND start_date <= $3::date AND end_date >= $2::date${excludeId ? " AND id <> $4" : ""} LIMIT 1`,
    excludeId
      ? [personId, startDate, endDate, excludeId]
      : [personId, startDate, endDate],
  );
  return Boolean(result.rows[0]);
}

function uniquePersonIds(value, fallback = "") {
  const candidates = Array.isArray(value) ? value : [value || fallback];
  return [...new Set(candidates.map(text).filter(Boolean))];
}

async function loadOrderRecord(id) {
  const result = await queryPostgres(
    `SELECT o.*, ARRAY(
      SELECT DISTINCT person_id FROM (
        SELECT o.person_id
        UNION ALL
        SELECT member.person_id
        FROM official_order_members member
        WHERE member.official_order_id = o.id
      ) people
    ) AS person_ids
    FROM official_orders o WHERE o.id = $1`,
    [id],
  );
  return result.rows[0] || null;
}

async function orderPersonIds(id) {
  return (await loadOrderRecord(id))?.person_ids || [];
}

async function peopleWithOffices(personIds) {
  if (!personIds.length) return [];
  return (
    await queryPostgres(
      "SELECT id, office_id FROM persons WHERE id = ANY($1::text[])",
      [personIds],
    )
  ).rows;
}

async function sessionCanManagePeople(session, personIds) {
  const people = await peopleWithOffices(personIds);
  return (
    people.length === personIds.length &&
    people.every((person) => sessionAllowsOffice(session, person.office_id))
  );
}

async function hasOrderRangeConflict(personId, startDate, endDate, excludeId = "") {
  const result = await queryPostgres(
    `SELECT DISTINCT o.id
     FROM official_orders o
     LEFT JOIN official_order_members member ON member.official_order_id = o.id
     WHERE (o.person_id = $1 OR member.person_id = $1)
       AND o.start_date <= $3::date AND o.end_date >= $2::date
       ${excludeId ? "AND o.id <> $4" : ""}
     LIMIT 1`,
    excludeId
      ? [personId, startDate, endDate, excludeId]
      : [personId, startDate, endDate],
  );
  return Boolean(result.rows[0]);
}

async function canManageOrder(session, id) {
  const personIds = await orderPersonIds(id);
  return personIds.length > 0 && sessionCanManagePeople(session, personIds);
}

async function access(request) {
  const session = await resolveEmployeeManagementSession(request, null);
  return session?.active ? session : null;
}

async function personOffice(personId) {
  const result = await queryPostgres(
    "SELECT office_id FROM persons WHERE id = $1",
    [personId],
  );
  return result.rows[0]?.office_id || "";
}

async function recordOwnership(type, id) {
  if (type === "leave") {
    const result = await queryPostgres(
      "SELECT p.office_id FROM employee_leaves r JOIN persons p ON p.id = r.person_id WHERE r.id = $1",
      [id],
    );
    const row = result.rows[0];
    return { found: Boolean(row), officeId: row?.office_id || "" };
  }
  if (type === "order") {
    const order = await loadOrderRecord(id);
    if (!order) return { found: false, officeId: "" };
    const people = await peopleWithOffices(order.person_ids || []);
    return { found: true, officeId: people[0]?.office_id || "" };
  }
  if (type === "holiday") {
    const result = await queryPostgres(
      "SELECT office_id, scope_type FROM holidays WHERE id = $1",
      [id],
    );
    const row = result.rows[0];
    return {
      found: Boolean(row),
      officeId: row?.scope_type === "national" ? "" : row?.office_id || "",
    };
  }
  const result = await queryPostgres(
    "SELECT scope_type, scope_id FROM workforce_policies WHERE id = $1",
    [id],
  );
  const row = result.rows[0];
  return {
    found: Boolean(row),
    officeId: row?.scope_type === "office" ? row.scope_id || "" : "",
  };
}

async function recordOffice(type, id) {
  const ownership = await recordOwnership(type, id);
  return ownership.found ? ownership.officeId : null;
}

function canManageRecord(session, type, officeId) {
  // Division and organization policies have no trustworthy direct office key in
  // this table. Until division ownership is normalized, only regional admins
  // may change them; office HR cannot use this endpoint to cross boundaries.
  if (type === "holiday" && !officeId)
    return session.role === "admin" && session.scope === "regional";
  if (!officeId)
    return session.role === "admin" && session.scope === "regional";
  return sessionAllowsOffice(session, officeId);
}

export async function GET(request) {
  const session = await access(request);
  if (!session)
    return NextResponse.json(
      { ok: false, message: "Admin or HR login is required." },
      { status: 401 },
    );
  const params = new URL(request.url).searchParams;
  const type = text(params.get("type"));
  if (!RECORDS[type])
    return NextResponse.json(
      { ok: false, message: "A valid record type is required." },
      { status: 400 },
    );
  const year = Number(params.get("year"));
  const globalAccess = session.role === "admin" && session.scope === "regional";
  const officeId = getSessionOfficeFilter(session);
  if (!globalAccess && !sessionAllowsOffice(session, officeId))
    return NextResponse.json({ ok: true, records: [] });
  let sql = type === "order"
    ? `SELECT r.*, ARRAY(
        SELECT DISTINCT person_id FROM (
          SELECT r.person_id
          UNION ALL
          SELECT member.person_id FROM official_order_members member
          WHERE member.official_order_id = r.id
        ) people
      ) AS person_ids FROM official_orders r`
    : `SELECT r.* FROM ${RECORDS[type].table} r`;
  const values = [];
  const conditions = [];
  if (!globalAccess) {
    values.push(officeId);
    if (type === "leave" || type === "order") {
      sql += " JOIN persons owner ON owner.id = r.person_id";
      conditions.push("owner.office_id = $1");
      if (type === "order") {
        conditions.push(`NOT EXISTS (
          SELECT 1 FROM official_order_members member
          LEFT JOIN persons member_person ON member_person.id = member.person_id
          WHERE member.official_order_id = r.id
            AND member_person.office_id IS DISTINCT FROM $1
        )`);
      }
    } else if (type === "holiday") {
      conditions.push("r.scope_type IN ('office', 'division') AND r.office_id = $1");
    } else {
      conditions.push("r.scope_type = 'office' AND r.scope_id = $1");
    }
  }
  if (type === "holiday" && Number.isInteger(year)) {
    values.push(`${year}-01-01`, `${year}-12-31`);
    conditions.push(`r.holiday_date BETWEEN $${values.length - 1}::date AND $${values.length}::date`);
  }
  if (conditions.length) sql += ` WHERE ${conditions.join(" AND ")}`;
  sql += type === "policy" ? " ORDER BY r.updated_at DESC" : " ORDER BY r.created_at DESC";
  const result = await queryPostgres(sql, values);
  let rows = result.rows;
  if (type === "leave") {
    const personIds = rows.map((row) => row.person_id).filter(Boolean);
    const offices = personIds.length
      ? await queryPostgres(
          "SELECT id, office_id FROM persons WHERE id = ANY($1::text[])",
          [personIds],
        )
      : { rows: [] };
    const allowedIds = new Set(
      offices.rows
        .filter((row) => sessionAllowsOffice(session, row.office_id))
        .map((row) => row.id),
    );
    rows = rows.filter((row) => allowedIds.has(row.person_id));
  } else if (type === "order") {
    const personIds = [...new Set(rows.flatMap((row) => row.person_ids))];
    const people = await peopleWithOffices(personIds);
    const allowedIds = new Set(people
      .filter((person) => sessionAllowsOffice(session, person.office_id))
      .map((person) => person.id));
    rows = rows.filter((row) => row.person_ids.length > 0 &&
      row.person_ids.every((personId) => allowedIds.has(personId)));
  } else if (type === "holiday") {
    rows = rows.filter((row) =>
      canManageRecord(
        session,
        type,
        row.scope_type === "national" ? "" : row.office_id,
      ),
    );
  } else {
    rows = rows.filter((row) =>
      canManageRecord(
        session,
        type,
        row.scope_type === "office" ? row.scope_id : "",
      ),
    );
  }
  return NextResponse.json({ ok: true, records: rows });
}

export async function POST(request) {
  const guard = createOriginGuard();
  const guarded = await guard(request);
  if (guarded) return guarded;
  const session = await access(request);
  if (!session)
    return NextResponse.json(
      { ok: false, message: "Admin or HR login is required." },
      { status: 401 },
    );
  const body = await request.json().catch(() => null);
  const type = text(body?.type);
  if (!RECORDS[type])
    return NextResponse.json(
      { ok: false, message: "A valid record type is required." },
      { status: 400 },
    );
  const id = crypto.randomUUID();
  try {
    let before = null;
    if (type === "holiday" && body?.seedYear) {
      if (!canManageRecord(session, "holiday", ""))
        return NextResponse.json(
          {
            ok: false,
            message:
              "Only Regional Admin may seed the national calendar.",
          },
          { status: 403 },
        );
      const rows = philippineHolidaySeed(body.seedYear);
      if (!rows.length) throw new SafeRequestError("Choose a valid holiday year.", {
        status: 400,
        code: "invalid_holiday_year",
      });
      for (const row of rows) {
        await queryPostgres(
          "INSERT INTO holidays (id, holiday_date, name, scope_type) VALUES ($1,$2,$3,'national') ON CONFLICT (holiday_date, scope_type, office_id, division_id) DO NOTHING",
          [crypto.randomUUID(), row.date, row.name],
        );
      }
      await auditWorkforce(session, {
        action: "seed",
        type: "holiday_calendar",
        id: String(body.seedYear),
        after: { year: Number(body.seedYear), holidays: rows },
        summary: `Seeded national holiday calendar for ${body.seedYear}`,
      });
      return NextResponse.json({ ok: true, seeded: rows.length });
    }
    if (type === "holiday") {
      const date = text(body.date);
      const name = text(body.name);
      const scopeType = ["national", "office", "division"].includes(
        text(body.scopeType),
      )
        ? text(body.scopeType)
        : "national";
      const officeId = scopeType === "national" ? "" : text(body.officeId);
      const divisionId = scopeType === "division" ? text(body.divisionId) : "";
      if (
        !validDate(date) ||
        !name ||
        (scopeType !== "national" && !officeId) ||
        (scopeType === "division" && !divisionId)
      )
        throw new SafeRequestError("Holiday date, name, and scope are required.", {
          status: 400,
          code: "invalid_holiday",
        });
      if (
        scopeType === "national" &&
        !canManageRecord(session, "holiday", "")
      )
        return NextResponse.json(
          { ok: false, message: "Only Regional Admin may manage national holidays." },
          { status: 403 },
        );
      if (officeId && !sessionAllowsOffice(session, officeId))
        return NextResponse.json(
          { ok: false, message: "This session cannot manage that office." },
          { status: 403 },
        );
      if (scopeType === "division" &&
          !findOfficeDivision(await getLocalOfficeRecord(officeId), divisionId))
        return NextResponse.json(
          { ok: false, message: "This division is not configured for that office." },
          { status: 403 },
        );
      await queryPostgres(
        "INSERT INTO holidays (id, holiday_date, name, scope_type, office_id, division_id, remarks) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [id, date, name, scopeType, officeId, divisionId, text(body.remarks)],
      );
    } else if (type === "leave") {
      const personId = text(body.personId);
      const start = text(body.startDate);
      const end = text(body.endDate);
      const officeId = await personOffice(personId);
      if (!personId || !validDate(start) || !validDate(end) || end < start)
        throw new SafeRequestError("Employee and a valid date range are required.", {
          status: 400,
          code: "invalid_leave_dates",
        });
      if (!sessionAllowsOffice(session, officeId))
        return NextResponse.json(
          { ok: false, message: "This session cannot manage that employee." },
          { status: 403 },
        );
      if (type === "leave") {
        const leaveType = text(body.leaveType).toUpperCase();
        if (!LEAVE_TYPES.includes(leaveType))
          throw new SafeRequestError(
            "Leave type must be VL, SL, CTO, or WL (Wellness Leave).",
            { status: 400, code: "invalid_leave_type" },
          );
        if (await hasRangeConflict("employee_leaves", personId, start, end))
          throw new SafeRequestError(
            "This employee already has an overlapping leave record.",
            { status: 400, code: "workforce_date_conflict" },
          );
        await queryPostgres(
          "INSERT INTO employee_leaves (id, person_id, leave_type, start_date, end_date, remarks) VALUES ($1,$2,$3,$4,$5,$6)",
          [id, personId, leaveType, start, end, text(body.remarks)],
        );
      }
    } else if (type === "order") {
      const personIds = uniquePersonIds(body.personIds, body.personId);
      const start = text(body.startDate);
      const end = text(body.endDate);
      if (!personIds.length || !validDate(start) || !validDate(end) || end < start)
        throw new SafeRequestError("At least one employee and a valid date range are required.", {
          status: 400,
          code: "invalid_official_order",
        });
      if (!(await sessionCanManagePeople(session, personIds)))
        return NextResponse.json(
          { ok: false, message: "This session cannot manage one or more selected employees." },
          { status: 403 },
        );
      for (const personId of personIds) {
        if (await hasOrderRangeConflict(personId, start, end))
          throw new SafeRequestError("A selected employee already has an overlapping official order.", {
            status: 400,
            code: "workforce_date_conflict",
          });
      }
      await withPostgresTransaction(async (client) => {
        await client.query(
          "INSERT INTO official_orders (id, person_id, order_type, order_number, start_date, end_date, remarks) VALUES ($1,$2,$3,$4,$5,$6,$7)",
          [id, personIds[0], text(body.orderType) || "Regional Order", text(body.orderNumber), start, end, text(body.remarks)],
        );
        for (const personId of personIds) {
          await client.query(
            "INSERT INTO official_order_members (official_order_id, person_id) VALUES ($1,$2)",
            [id, personId],
          );
        }
      });
    } else {
      const scopeType = ["organization", "office", "division"].includes(
        text(body.scopeType),
      )
        ? text(body.scopeType)
        : "";
      const scopeId = scopeType === "organization" ? "" : text(body.scopeId);
      if (!scopeType || (scopeType !== "organization" && !scopeId))
        throw new SafeRequestError("A valid policy scope is required.", {
          status: 400,
          code: "invalid_policy_scope",
        });
      if (
        (scopeType === "organization" || scopeType === "division") &&
        !(session.role === "admin" && session.scope === "regional")
      ) {
        return NextResponse.json(
          { ok: false, message: "Only a regional administrator may manage organization or division policies." },
          { status: 403 },
        );
      }
      if (scopeType === "office" && !sessionAllowsOffice(session, scopeId))
        return NextResponse.json(
          { ok: false, message: "This session cannot manage that office." },
          { status: 403 },
        );
      before = (
        await queryPostgres(
          "SELECT * FROM workforce_policies WHERE scope_type = $1 AND scope_id = $2",
          [scopeType, scopeId],
        )
      ).rows[0] || null;
      await queryPostgres(
        "INSERT INTO workforce_policies (id, scope_type, scope_id, flexitime, weekly_schedule) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb) ON CONFLICT (scope_type, scope_id) DO UPDATE SET flexitime = EXCLUDED.flexitime, weekly_schedule = EXCLUDED.weekly_schedule, updated_at = now()",
        [
          id,
          scopeType,
          scopeId,
          JSON.stringify({ enabled: body?.flexitime?.enabled === true, requiredMinutes: Number(body?.flexitime?.requiredMinutes) || null }),
          JSON.stringify(normalizeWeeklySchedule(body?.weeklySchedule)),
        ],
      );
    }
    const persistedId = type === "policy"
      ? (await queryPostgres('SELECT id FROM workforce_policies WHERE scope_type = $1 AND scope_id = $2', [text(body.scopeType), text(body.scopeType) === 'organization' ? '' : text(body.scopeId)])).rows[0]?.id || id
      : id;
    const officeId =
      type === "leave" || type === "order"
        ? await recordOffice(type, id)
        : type === "holiday"
          ? text(body.scopeType) === "national"
            ? ""
            : text(body.officeId)
          : text(body.scopeType) === "office"
            ? text(body.scopeId)
            : "";
    await auditWorkforce(session, {
      action: before ? "update" : "create",
      type,
      id: persistedId,
      officeId,
      before,
      after: await loadRecord(type, persistedId),
      summary: `Created ${type} record`,
    });
    return NextResponse.json({ ok: true, id: persistedId });
  } catch (error) {
    return serverErrorResponse(error, {
      context: "api/hr/workforce-records:POST",
      publicMessage: "Unable to save workforce record.",
    });
  }
}

export async function PATCH(request) {
  const guard = createOriginGuard();
  const guarded = await guard(request);
  if (guarded) return guarded;
  const session = await access(request);
  if (!session)
    return NextResponse.json(
      { ok: false, message: "Admin or HR login is required." },
      { status: 401 },
    );
  const body = await request.json().catch(() => null);
  const type = text(body?.type);
  if (!type) {
    const personId = text(body?.personId);
    const schedule = normalizeWeeklySchedule(body?.weeklySchedule);
    if (!personId)
      return NextResponse.json(
        { ok: false, message: "Employee is required." },
        { status: 400 },
      );
    const officeId = await personOffice(personId);
    if (!sessionAllowsOffice(session, officeId))
      return NextResponse.json(
        { ok: false, message: "This session cannot manage that employee." },
        { status: 403 },
      );
    const before =
      (
        await queryPostgres(
          "SELECT weekly_schedule, flexitime FROM persons WHERE id = $1",
          [personId],
        )
      ).rows[0] || null;
    const after = {
      weekly_schedule: schedule,
      flexitime: {
        enabled: body?.flexitime?.enabled === true,
        requiredMinutes: Number(body?.flexitime?.requiredMinutes) || null,
      },
    };
    await queryPostgres(
      "UPDATE persons SET weekly_schedule = $2::jsonb, flexitime = $3::jsonb, updated_at = now() WHERE id = $1",
      [
        personId,
        JSON.stringify(after.weekly_schedule),
        JSON.stringify(after.flexitime),
      ],
    );
    await auditWorkforce(session, {
      action: "update",
      type: "employee_schedule",
      id: personId,
      officeId,
      before,
      after,
      summary: "Updated employee schedule and flexitime",
    });
    return NextResponse.json({ ok: true });
  }
  const id = text(body?.id);
  if (!RECORDS[type] || !id)
    return NextResponse.json(
      { ok: false, message: "Record type and id are required." },
      { status: 400 },
    );
  const ownership = await recordOwnership(type, id);
  if (!ownership.found)
    return NextResponse.json(
      { ok: false, message: "Workforce record was not found." },
      { status: 404 },
    );
  const officeId = ownership.officeId;
  if (type === "order" && !(await canManageOrder(session, id)))
    return NextResponse.json(
      { ok: false, message: "This session cannot manage that official order." },
      { status: 403 },
    );
  if (type !== "order" && !canManageRecord(session, type, officeId))
    return NextResponse.json(
      { ok: false, message: "This session cannot manage that record." },
      { status: 403 },
    );
  try {
    const before = await loadRecord(type, id);
    if (type === "holiday") {
      const date = text(body.date);
      const name = text(body.name);
      if (!validDate(date) || !name)
        throw new SafeRequestError("Holiday date and name are required.", {
          status: 400,
          code: "invalid_holiday",
        });
      await queryPostgres(
        "UPDATE holidays SET holiday_date=$2, name=$3, remarks=$4, updated_at=now() WHERE id=$1",
        [id, date, name, text(body.remarks)],
      );
    } else if (type === "leave") {
      const start = text(body.startDate);
      const end = text(body.endDate);
      const leaveType = text(body.leaveType).toUpperCase();
      if (
        !validDate(start) ||
        !validDate(end) ||
        end < start ||
        !LEAVE_TYPES.includes(leaveType)
      )
        throw new SafeRequestError("A valid leave type and date range are required.", {
          status: 400,
          code: "invalid_leave_type",
        });
      const personResult = await queryPostgres(
        "SELECT person_id FROM employee_leaves WHERE id=$1",
        [id],
      );
      const personId = personResult.rows[0]?.person_id;
      if (await hasRangeConflict("employee_leaves", personId, start, end, id))
        throw new SafeRequestError(
          "This employee already has an overlapping leave record.",
          { status: 400, code: "workforce_date_conflict" },
        );
      await queryPostgres(
        "UPDATE employee_leaves SET leave_type=$2,start_date=$3,end_date=$4,remarks=$5,updated_at=now() WHERE id=$1",
        [id, leaveType, start, end, text(body.remarks)],
      );
    } else if (type === "order") {
      const start = text(body.startDate);
      const end = text(body.endDate);
      const personIds = uniquePersonIds(body.personIds, body.personId);
      if (!validDate(start) || !validDate(end) || end < start)
        throw new SafeRequestError("A valid date range is required.", {
          status: 400,
          code: "invalid_official_order",
        });
      if (!personIds.length)
        throw new SafeRequestError("Select at least one employee for this official order.", {
          status: 400,
          code: "invalid_official_order",
        });
      if (!(await sessionCanManagePeople(session, personIds)))
        return NextResponse.json(
          { ok: false, message: "This session cannot manage one or more selected employees." },
          { status: 403 },
        );
      for (const personId of personIds) {
        if (await hasOrderRangeConflict(personId, start, end, id))
          throw new SafeRequestError("A selected employee already has an overlapping official order.", {
            status: 400,
            code: "workforce_date_conflict",
          });
      }
      await withPostgresTransaction(async (client) => {
        await client.query(
          "UPDATE official_orders SET person_id=$2,order_type=$3,order_number=$4,start_date=$5,end_date=$6,remarks=$7,updated_at=now() WHERE id=$1",
          [id, personIds[0], text(body.orderType) || "Regional Order", text(body.orderNumber), start, end, text(body.remarks)],
        );
        await client.query("DELETE FROM official_order_members WHERE official_order_id=$1", [id]);
        for (const personId of personIds) {
          await client.query(
            "INSERT INTO official_order_members (official_order_id, person_id) VALUES ($1,$2)",
            [id, personId],
          );
        }
      });
    } else {
      await queryPostgres(
        "UPDATE workforce_policies SET flexitime=$2::jsonb,weekly_schedule=$3::jsonb,updated_at=now() WHERE id=$1",
        [
          id,
          JSON.stringify({
            enabled: body?.flexitime?.enabled === true,
            requiredMinutes: Number(body?.flexitime?.requiredMinutes) || null,
          }),
          JSON.stringify(normalizeWeeklySchedule(body?.weeklySchedule)),
        ],
      );
    }
    await auditWorkforce(session, {
      action: "update",
      type,
      id,
      officeId,
      before,
      after: await loadRecord(type, id),
      summary: `Updated ${type} record`,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverErrorResponse(error, {
      context: "api/hr/workforce-records:PATCH",
      publicMessage: "Unable to update workforce record.",
    });
  }
}

export async function DELETE(request) {
  const guard = createOriginGuard();
  const guarded = await guard(request);
  if (guarded) return guarded;
  const session = await access(request);
  if (!session)
    return NextResponse.json(
      { ok: false, message: "Admin or HR login is required." },
      { status: 401 },
    );
  const params = new URL(request.url).searchParams;
  const type = text(params.get("type"));
  const id = text(params.get("id"));
  if (!RECORDS[type] || !id)
    return NextResponse.json(
      { ok: false, message: "Record type and id are required." },
      { status: 400 },
    );
  const ownership = await recordOwnership(type, id);
  if (!ownership.found)
    return NextResponse.json(
      { ok: false, message: "Workforce record was not found." },
      { status: 404 },
    );
  const officeId = ownership.officeId;
  if (type === "order" && !(await canManageOrder(session, id)))
    return NextResponse.json(
      { ok: false, message: "This session cannot manage that official order." },
      { status: 403 },
    );
  if (type !== "order" && !canManageRecord(session, type, officeId))
    return NextResponse.json(
      { ok: false, message: "This session cannot manage that record." },
      { status: 403 },
    );
  const before = await loadRecord(type, id);
  await queryPostgres(`DELETE FROM ${RECORDS[type].table} WHERE id = $1`, [id]);
  await auditWorkforce(session, {
    action: "delete",
    type,
    id,
    officeId,
    before,
    after: null,
    summary: `Deleted ${type} record`,
  });
  return NextResponse.json({ ok: true });
}
