"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Field } from "@/components/shared/ui";
import { useOffices } from "@/lib/admin/hooks/useOffices";
import WorkforceRecordModal from "@/components/admin/WorkforceRecordModal";
import DilgLoadingIndicator from "@/components/shared/DilgLoadingIndicator";

const TABS = [
  ["holiday", "Holidays"],
  ["leave", "Leave"],
  ["order", "Official Orders"],
];
const ADD_LABELS = { holiday: "Holiday", leave: "Leave", order: "Official Order" };
const LEAVE_LABELS = {
  VL: "Vacation Leave",
  SL: "Sick Leave",
  CTO: "Compensatory Time Off",
  WL: "Wellness Leave",
};
function today() {
  return dateInputValue(new Date());
}

function dateInputValue(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatCalendarDate(value) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDateRange(start, end) {
  const startLabel = formatCalendarDate(start);
  const endLabel = formatCalendarDate(end);
  return startLabel === endLabel ? startLabel : `${startLabel} to ${endLabel}`;
}

async function readApiJson(response, fallback) {
  const body = await response.text();
  try {
    return body ? JSON.parse(body) : { ok: false, message: fallback };
  } catch {
    return { ok: false, message: fallback };
  }
}

export default function WorkforcePanel({ allowNationalHolidays = false }) {
  const { visibleOffices } = useOffices();
  const [tab, setTab] = useState("holiday");
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [editing, setEditing] = useState(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [form, setForm] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [recordsResponse, employeeResponse] = await Promise.all([
        fetch(
          `/api/hr/workforce-records?type=${tab}${tab === "holiday" ? `&year=${year}` : ""}`,
          { cache: "no-store" },
        ),
        fetch("/api/hr/dtr/employees", { cache: "no-store" }),
      ]);
      const [recordData, employeeData] = await Promise.all([
        readApiJson(recordsResponse, `Could not load ${tab} records (${recordsResponse.status}).`),
        readApiJson(employeeResponse, `Could not load employee choices (${employeeResponse.status}).`),
      ]);
      if (!recordData.ok)
        throw new Error(
          recordData.message || "Could not load workforce records.",
        );
      setRecords(recordData.records || []);
      if (employeeData.ok) setEmployees(employeeData.employees || []);
    } catch (error) {
      setNotice(error.message || "Could not load workforce records.");
    }
    setLoading(false);
  }, [tab, year]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    setEditing(null);
    setForm({});
  }, [tab]);

  const employeesById = useMemo(
    () => new Map(employees.map((person) => [person.id, person])),
    [employees],
  );
  const employeeName = useMemo(
    () => new Map(employees.map((person) => [person.id, person.name])),
    [employees],
  );
  const divisions = useMemo(
    () =>
      visibleOffices.flatMap((office) =>
        (office.divisions || []).map((division) => ({
          ...division,
          officeId: office.id,
          officeName: office.name,
        })),
      ),
    [visibleOffices],
  );
  const holidayScopeLabel = useCallback((record) => {
    const scopeType = record.scope_type || record.scopeType || "national";
    if (scopeType === "national") return "National";
    const office = visibleOffices.find((item) => item.id === (record.office_id || record.officeId));
    if (scopeType === "office") return office ? `Office · ${office.name}` : "Office";
    const division = divisions.find((item) => item.id === (record.division_id || record.divisionId));
    return division ? `Division · ${division.name}` : "Division";
  }, [divisions, visibleOffices]);
  const recordScopeLabel = useCallback((record) => {
    if (tab === "leave") {
      const employee = employeesById.get(record.person_id || record.personId);
      if (!employee) return "Employee leave";
      return employee.divisionName
        ? `Office · ${employee.officeName || "Unassigned"} · ${employee.divisionName}`
        : `Office · ${employee.officeName || "Unassigned"}`;
    }
    if (tab === "order") {
      const people = (record.person_ids || [record.person_id]).filter(Boolean).map((id) => employeesById.get(id)).filter(Boolean);
      const officeNames = [...new Set(people.map((person) => person.officeName).filter(Boolean))];
      const count = (record.person_ids || [record.person_id]).filter(Boolean).length;
      const officeLabel = officeNames.length === 0 ? "Office unavailable" : officeNames.length === 1 ? officeNames[0] : `${officeNames.length} offices`;
      return `${count} employee${count === 1 ? "" : "s"} · ${officeLabel}`;
    }
    return holidayScopeLabel(record);
  }, [employeesById, holidayScopeLabel, tab]);
  const update = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));
  const beginCreate = () => {
    setEditing("new");
    setForm(
      tab === "holiday"
        ? {
            date: `${year}-01-01`,
            name: "",
            scopeType: allowNationalHolidays ? "national" : "office",
            remarks: "",
          }
        : tab === "leave"
          ? {
              personId: "",
              leaveType: "VL",
              startDate: today(),
              endDate: today(),
              remarks: "",
            }
          : tab === "order"
            ? {
                personIds: [],
                orderType: "Regional Order",
                orderNumber: "",
                startDate: today(),
                endDate: today(),
                remarks: "",
              }
            : {},
    );
  };
  const beginEdit = (record) => {
    setEditing(record.id);
    setForm({
      ...record,
      date: dateInputValue(record.holiday_date || record.date),
      startDate: dateInputValue(record.start_date || record.startDate),
      endDate: dateInputValue(record.end_date || record.endDate),
      personId: record.person_id || record.personId,
      personIds: record.person_ids || (record.person_id ? [record.person_id] : []),
      leaveType: record.leave_type || record.leaveType,
      orderType: record.order_type || record.orderType,
      orderNumber: record.order_number || record.orderNumber,
    });
  };
  const save = async (event) => {
    event.preventDefault();
    if (saving) return;
    setNotice("");
    setSaving(true);
    try {
      const payload = {
        ...form,
        type: tab,
        id: editing === "new" ? undefined : editing,
      };
      const response = await fetch("/api/hr/workforce-records", {
        method: editing === "new" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readApiJson(response, `Could not save workforce record (${response.status}).`);
      if (!data.ok) {
        setNotice(data.message || "Could not save workforce record.");
        return;
      }
      setNotice("Saved successfully.");
      setEditing(null);
      setForm({});
      await load();
    } catch {
      setNotice("Could not save workforce record. Check the connection and try again.");
    } finally {
      setSaving(false);
    }
  };
  const remove = async (id) => {
    if (
      !window.confirm(
        "Remove this workforce record? Attendance punches will not be deleted.",
      )
    )
      return;
    const response = await fetch(
      `/api/hr/workforce-records?type=${tab}&id=${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    const data = await readApiJson(response, `Could not remove workforce record (${response.status}).`);
    if (!data.ok) {
      setNotice(data.message || "Could not remove record.");
      return;
    }
    setNotice("Removed successfully.");
    load();
  };
  const seed = async () => {
    const response = await fetch("/api/hr/workforce-records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "holiday", seedYear: year }),
    });
    const data = await readApiJson(response, `Could not seed holidays (${response.status}).`);
    setNotice(
      data.ok
        ? `Seeded ${data.seeded} editable national holidays.`
        : data.message || "Could not seed holidays.",
    );
    if (data.ok) load();
  };
  return (
    <section className="flex h-full min-h-0 flex-col gap-2 bg-white p-3 sm:p-4">
      <header className="flex flex-wrap items-center justify-end gap-2 border-b border-black/5 pb-2">
        <div className="flex gap-2">
          <button
            className="rounded-xl border border-black/10 px-3 py-2 text-sm font-semibold"
            onClick={beginCreate}
            type="button"
          >
            Add {ADD_LABELS[tab]}
          </button>
          {tab === "holiday" && allowNationalHolidays ? (
            <button
              className="rounded-xl bg-navy px-3 py-2 text-sm font-semibold text-white"
              onClick={seed}
              type="button"
            >
              Seed {year}
            </button>
          ) : null}
        </div>
      </header>
      <div className="flex gap-2 overflow-x-auto">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold ${tab === id ? "bg-navy text-white" : "border border-black/10 bg-white text-ink"}`}
            onClick={() => setTab(id)}
            type="button"
          >
            {label}
          </button>
        ))}
        {tab === "holiday" ? (
          <input
            aria-label="Holiday year"
            className="w-24 rounded-xl border border-black/10 px-3 py-2 text-sm"
            min="2000"
            onChange={(event) => setYear(Number(event.target.value))}
            type="number"
            value={year}
          />
        ) : null}
      </div>
      {notice ? (
        <div className="rounded-xl border border-navy/10 bg-navy/[0.04] px-3 py-2 text-sm text-navy-dark">
          {notice}
        </div>
      ) : null}
      <div className={`grid min-h-0 flex-1 gap-2 ${tab === "holiday" ? "lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]" : "lg:grid-cols-1"}`}>
        <div className="min-h-0 overflow-auto rounded-2xl border border-black/5">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-stone-100 text-xs uppercase text-muted">
              <tr>
                <th className="px-4 py-3">Record</th>
                <th className="px-4 py-3">Dates / scope</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-8 text-muted" colSpan="3">
                    <DilgLoadingIndicator label="Loading attendance records…" />
                  </td>
                </tr>
              ) : records.length ? (
                records.map((record) => (
                  <tr className="border-t border-black/5" key={record.id}>
                    <td className="px-4 py-3 font-medium">
                      {tab === "holiday"
                        ? record.name
                        : tab === "leave"
                          ? `${employeeName.get(record.person_id) || record.person_id} — ${LEAVE_LABELS[record.leave_type] || record.leave_type}`
                          : tab === "order"
                            ? `${(record.person_ids || [record.person_id]).map((personId) => employeeName.get(personId) || personId).join(", ")} — ${record.order_type}`
                            : ""}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {tab === "holiday" ? (
                        <>
                          <div className="font-medium text-ink">{formatCalendarDate(record.holiday_date || record.date)}</div>
                          <div className="mt-0.5 text-xs text-muted">{holidayScopeLabel(record)}</div>
                        </>
                      ) : (
                        <>
                          <div className="font-medium text-ink">{formatDateRange(record.start_date || record.startDate, record.end_date || record.endDate)}</div>
                          <div className="mt-0.5 text-xs text-muted">{recordScopeLabel(record)}</div>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          className="font-semibold text-navy"
                          onClick={() => beginEdit(record)}
                          type="button"
                        >
                          Edit
                        </button>
                        <button
                          className="font-semibold text-red-700"
                          onClick={() => remove(record.id)}
                          type="button"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-8 text-muted" colSpan="3">
                    No records yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <form
          className={`min-h-0 overflow-auto rounded-2xl border border-black/5 bg-stone-50 p-4 ${tab === "holiday" ? "" : "hidden"}`}
          onSubmit={save}
        >
          {editing ? (
            <div className="grid gap-3">
              <h3 className="font-bold text-ink">
                {editing === "new" ? "New" : "Edit"}{" "}
                {TABS.find((item) => item[0] === tab)?.[1]}
              </h3>
              {tab === "holiday" ? (
                <>
                  <Field label="Date">
                    <input
                      className="w-full rounded-xl border border-black/10 px-3 py-2"
                      onChange={(e) => update("date", e.target.value)}
                      required
                      type="date"
                      value={form.date || ""}
                    />
                  </Field>
                  <Field label="Name">
                    <input
                      className="w-full rounded-xl border border-black/10 px-3 py-2"
                      onChange={(e) => update("name", e.target.value)}
                      required
                      value={form.name || ""}
                    />
                  </Field>
                  <Field label="Scope">
                    <select className="w-full rounded-xl border border-black/10 px-3 py-2" onChange={(e) => update("scopeType", e.target.value)} value={form.scopeType || "national"}>
                      {allowNationalHolidays ? <option value="national">National (Regional Admin or HR)</option> : null}
                      <option value="office">Office</option>
                      <option value="division">Division</option>
                    </select>
                  </Field>
                  {form.scopeType === "office" || form.scopeType === "division" ? (
                    <Field label="Office">
                      <select className="w-full rounded-xl border border-black/10 px-3 py-2" onChange={(e) => update("officeId", e.target.value)} required value={form.officeId || ""}>
                        <option value="">Choose office</option>
                        {visibleOffices.map((office) => <option key={office.id} value={office.id}>{office.name}</option>)}
                      </select>
                    </Field>
                  ) : null}
                  {form.scopeType === "division" ? (
                    <Field label="Division">
                      <select className="w-full rounded-xl border border-black/10 px-3 py-2" onChange={(e) => update("divisionId", e.target.value)} required value={form.divisionId || ""}>
                        <option value="">Choose division</option>
                        {divisions.filter((division) => !form.officeId || division.officeId === form.officeId).map((division) => <option key={division.id} value={division.id}>{division.name}</option>)}
                      </select>
                    </Field>
                  ) : null}
                </>
              ) : null}
              <Field label="Remarks">
                <textarea
                  className="min-h-20 w-full rounded-xl border border-black/10 px-3 py-2"
                  onChange={(e) => update("remarks", e.target.value)}
                  value={form.remarks || ""}
                />
              </Field>
              <div className="flex gap-2">
                <button
                  className="inline-flex items-center gap-2 rounded-xl bg-navy px-4 py-2 font-semibold text-white disabled:opacity-50"
                  disabled={saving}
                  type="submit"
                >
                  {saving ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />Saving…</> : "Save"}
                </button>
                <button
                  className="rounded-xl border border-black/10 px-4 py-2 font-semibold"
                  onClick={() => {
                    setEditing(null);
                    setForm({});
                  }}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="py-10 text-center text-sm text-muted">
              Select a record or add a new one.
            </div>
          )}
        </form>
      </div>
      {(tab === "leave" || tab === "order") && editing ? (
        <WorkforceRecordModal
          editing={editing}
          employees={employees}
          form={form}
          onClose={() => {
            setEditing(null);
            setForm({});
          }}
          onSubmit={save}
          saving={saving}
          tab={tab}
          update={update}
        />
      ) : null}
    </section>
  );
}
