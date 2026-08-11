import "server-only";

import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import { strToU8, unzipSync, zipSync } from "fflate";

export const DTR_EXCEL_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const DTR_EXCEL_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const TEMPLATE_PATH = "./templates/dtr-format.xlsx";
const WORKSHEET_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml";
const CALC_CHAIN_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml";
const WORKSHEET_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet";
const CALC_CHAIN_REL_TYPE =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/calcChain";
const SHEET_RELS_TEMPLATE_PATH = "xl/worksheets/_rels/sheet1.xml.rels";
const SHEET_XML_TEMPLATE_PATH = "xl/worksheets/sheet1.xml";
const STYLES_XML_PATH = "xl/styles.xml";
const SPECIAL_ROW_COLORS = {
  ob: "FFBBF7D0",
  absent: "FFFECACA",
  wl: "FFBFDBFE",
  vl: "FFFFFFFF",
  holiday: "FFF3F4F6",
  sl: "FFE0E7FF",
  cto: "FFFEF3C7",
};
const DTR_ROW_STYLE_IDS = ["12", "13", "14", "15", "16", "17", "18"];
const TIME_CELL_STYLE_IDS = ["13", "14"];
const DTR_TIME_FONT_COLOR = "FF808080";

const COPY_DEFINITIONS = [
  {
    name: "B4",
    period: "D5",
    amInSchedule: "D7",
    amOutSchedule: "D8",
    pmInSchedule: "E7",
    pmOutSchedule: "E8",
    day: "A",
    amIn: "B",
    amOut: "C",
    pmIn: "D",
    pmOut: "E",
    undertimeHours: "F",
    undertimeMinutes: "G",
    dayStyle: "12",
    amInStyle: "13",
    amOutStyle: "14",
    pmInStyle: "13",
    pmOutStyle: "14",
    undertimeHoursStyle: "15",
    undertimeMinutesStyle: "16",
    employeeName: "B50",
    signatoryName: "B57",
    signatoryPosition: "B58",
  },
  {
    name: "J4",
    period: "L5",
    amInSchedule: "L7",
    amOutSchedule: "L8",
    pmInSchedule: "M7",
    pmOutSchedule: "M8",
    day: "I",
    amIn: "J",
    amOut: "K",
    pmIn: "L",
    pmOut: "M",
    undertimeHours: "N",
    undertimeMinutes: "O",
    dayStyle: "12",
    amInStyle: "13",
    amOutStyle: "14",
    pmInStyle: "13",
    pmOutStyle: "14",
    undertimeHoursStyle: "17",
    undertimeMinutesStyle: "18",
    employeeName: "J50",
    signatoryName: "J57",
    signatoryPosition: "J58",
  },
];

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function regexEscape(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function columnIndex(column) {
  return String(column || "")
    .toUpperCase()
    .split("")
    .reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0);
}

function parseCellRef(ref) {
  const match = String(ref || "").match(/^([A-Z]+)(\d+)$/i);
  if (!match) return null;
  return {
    column: match[1].toUpperCase(),
    columnIndex: columnIndex(match[1]),
    row: Number.parseInt(match[2], 10),
  };
}

function getCellStyle(cellXml) {
  const match = String(cellXml || "").match(/\ss="([^"]+)"/);
  return match ? match[1] : "";
}

function getXmlAttribute(xml, name, fallback = "") {
  const match = String(xml || "").match(
    new RegExp(`\\b${regexEscape(name)}="([^"]*)"`),
  );
  return match ? match[1] : fallback;
}

function updateSectionCount(sectionXml, nextCount) {
  return sectionXml.replace(/\bcount="\d+"/, `count="${nextCount}"`);
}

function appendSectionElement(stylesXml, sectionName, elementXml) {
  const sectionPattern = new RegExp(
    `<${sectionName}\\b[^>]*>[\\s\\S]*?<\\/${sectionName}>`,
  );
  const sectionXml = stylesXml.match(sectionPattern)?.[0] || "";
  if (!sectionXml) return { xml: stylesXml, index: -1 };

  const count = Number.parseInt(getXmlAttribute(sectionXml, "count", "0"), 10);
  const nextIndex = Number.isFinite(count) ? count : 0;
  const nextSectionXml = updateSectionCount(
    sectionXml.replace(`</${sectionName}>`, `${elementXml}</${sectionName}>`),
    nextIndex + 1,
  );

  return {
    xml: stylesXml.replace(sectionPattern, nextSectionXml),
    index: nextIndex,
  };
}

function getCellXfs(stylesXml) {
  const cellXfs =
    String(stylesXml || "").match(/<cellXfs[\s\S]*?<\/cellXfs>/)?.[0] || "";
  const body = cellXfs
    .replace(/^<cellXfs[^>]*>/, "")
    .replace(/<\/cellXfs>$/, "");
  const xfs = [];
  let cursor = 0;

  while (cursor < body.length) {
    const start = body.indexOf("<xf", cursor);
    if (start < 0) break;
    const openEnd = body.indexOf(">", start);
    if (openEnd < 0) break;
    const open = body.slice(start, openEnd + 1);

    if (open.endsWith("/>")) {
      xfs.push(open);
      cursor = openEnd + 1;
      continue;
    }

    const end = body.indexOf("</xf>", openEnd);
    if (end < 0) break;
    xfs.push(body.slice(start, end + 5));
    cursor = end + 5;
  }

  return xfs;
}

function xfWithFill(baseXf, fillId) {
  const source =
    baseXf || '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';
  const withFill = /\bfillId="[^"]*"/.test(source)
    ? source.replace(/\bfillId="[^"]*"/, `fillId="${fillId}"`)
    : source.replace("<xf", `<xf fillId="${fillId}"`);
  return /\bapplyFill=/.test(withFill)
    ? withFill.replace(/\bapplyFill="[^"]*"/, 'applyFill="1"')
    : withFill.replace("<xf", '<xf applyFill="1"');
}

function xfWithFont(baseXf, fontId) {
  const source =
    baseXf || '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>';
  const withFont = /\bfontId="[^"]*"/.test(source)
    ? source.replace(/\bfontId="[^"]*"/, `fontId="${fontId}"`)
    : source.replace("<xf", `<xf fontId="${fontId}"`);
  return /\bapplyFont=/.test(withFont)
    ? withFont.replace(/\bapplyFont="[^"]*"/, 'applyFont="1"')
    : withFont.replace("<xf", '<xf applyFont="1"');
}

function appendDtrTimeValueStyles(stylesXml) {
  if (!stylesXml) return { stylesXml, timeStyles: {} };
  const fontResult = appendSectionElement(
    stylesXml,
    "fonts",
    `<font><sz val="8"/><color rgb="${DTR_TIME_FONT_COLOR}"/><name val="Arial"/><family val="2"/></font>`,
  );
  if (fontResult.index < 0) return { stylesXml, timeStyles: {} };

  let output = fontResult.xml;
  const timeStyles = {};
  for (const baseStyleId of TIME_CELL_STYLE_IDS) {
    const baseXf = getCellXfs(output)[Number.parseInt(baseStyleId, 10)] || "";
    const styleResult = appendSectionElement(
      output,
      "cellXfs",
      xfWithFont(baseXf, fontResult.index),
    );
    if (styleResult.index >= 0) {
      output = styleResult.xml;
      timeStyles[baseStyleId] = String(styleResult.index);
    }
  }
  return { stylesXml: output, timeStyles };
}

function appendDtrSpecialStyles(stylesXml) {
  if (!stylesXml) return { stylesXml, specialStyles: {} };
  let output = stylesXml;
  const specialStyles = {};
  for (const [kind, color] of Object.entries(SPECIAL_ROW_COLORS)) {
    const fillResult = appendSectionElement(
      output,
      "fills",
      `<fill><patternFill patternType="solid"><fgColor rgb="${color}"/><bgColor indexed="64"/></patternFill></fill>`,
    );
    if (fillResult.index < 0) continue;
    output = fillResult.xml;
    specialStyles[kind] = {};
    for (const baseStyleId of DTR_ROW_STYLE_IDS) {
      const baseXf = getCellXfs(output)[Number.parseInt(baseStyleId, 10)] || "";
      const styleResult = appendSectionElement(
        output,
        "cellXfs",
        xfWithFill(baseXf, fillResult.index),
      );
      if (styleResult.index >= 0) {
        output = styleResult.xml;
        specialStyles[kind][baseStyleId] = String(styleResult.index);
      }
    }
  }
  return { stylesXml: output, specialStyles };
}

function buildCellXml(ref, value, styleId = "") {
  const normalized = value == null ? "" : value;
  const style = styleId ? ` s="${xmlEscape(styleId)}"` : "";

  if (
    normalized &&
    typeof normalized === "object" &&
    Number.isInteger(normalized.sharedStringIndex)
  ) {
    return `<c r="${ref}"${style} t="s"><v>${normalized.sharedStringIndex}</v></c>`;
  }

  if (normalized === "") {
    return `<c r="${ref}"${style}/>`;
  }

  if (typeof normalized === "number" && Number.isFinite(normalized)) {
    return `<c r="${ref}"${style}><v>${normalized}</v></c>`;
  }

  return `<c r="${ref}"${style} t="inlineStr"><is><t>${xmlEscape(normalized)}</t></is></c>`;
}

function replaceCellXml(rowXml, ref, value, forcedStyleId = "") {
  const parsed = parseCellRef(ref);
  if (!parsed) return rowXml;

  const cellPattern = new RegExp(
    `<c\\b(?=[^>]*\\br="${ref}")[\\s\\S]*?<\\/c>|<c\\b(?=[^>]*\\br="${ref}")[^>]*/>`,
  );
  const existing = rowXml.match(cellPattern)?.[0] || "";
  const styleId = forcedStyleId || getCellStyle(existing);
  const nextCell = buildCellXml(ref, value, styleId);

  if (existing) {
    return rowXml.replace(cellPattern, nextCell);
  }

  const insertionPoint = rowXml.search(
    new RegExp(`<c\\b(?=[^>]*\\br="[A-Z]+${parsed.row}")`, "g"),
  );
  if (insertionPoint === -1) {
    return rowXml.replace("</row>", `${nextCell}</row>`);
  }

  const cells = [
    ...rowXml.matchAll(/<c\b(?=[^>]*\br="([A-Z]+)\d+")[\s\S]*?(?:<\/c>|\/>)/g),
  ];
  const next = cells.find(
    (match) => columnIndex(match[1]) > parsed.columnIndex,
  );
  if (!next) return rowXml.replace("</row>", `${nextCell}</row>`);
  return `${rowXml.slice(0, next.index)}${nextCell}${rowXml.slice(next.index)}`;
}

function setCell(sheetXml, ref, value, styleId = "") {
  const parsed = parseCellRef(ref);
  if (!parsed) return sheetXml;
  const rowPattern = new RegExp(
    `<row\\b(?=[^>]*\\br="${parsed.row}")[\\s\\S]*?<\\/row>`,
  );
  const rowXml = sheetXml.match(rowPattern)?.[0];
  if (!rowXml) return sheetXml;
  return sheetXml.replace(
    rowPattern,
    replaceCellXml(rowXml, ref, value, styleId),
  );
}

function hasRowTimes(row) {
  return Boolean(row?.amIn || row?.amOut || row?.pmIn || row?.pmOut);
}

function weekendLabel(row) {
  if (!row?.isWeekend || hasRowTimes(row)) return "";
  return row.dayOfWeek === "SATURDAY" ? "SATURDAY" : "SUNDAY";
}

function specialStyleKind(row) {
  if (row?.specialCode) return String(row.specialCode).toLowerCase();
  return row?.isAbsent ? "absent" : "";
}

function specialStyleId(styleMap, kind, baseStyleId) {
  return kind ? styleMap?.[kind]?.[baseStyleId] || "" : "";
}

function timeStyleId(value, baseStyleId, timeStyles = {}) {
  return value && timeStyles[baseStyleId]
    ? timeStyles[baseStyleId]
    : baseStyleId;
}

function formatEmployeeSignatureName(employee = {}) {
  const nameParts = employee.nameParts || {};
  const formatted = [
    nameParts.firstName,
    nameParts.middleInitial,
    nameParts.familyName,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
  return formatted || String(employee.name || "").trim();
}

function effectiveSchedule(dtr) {
  const schedules = (dtr?.rows || [])
    .filter((row) => row?.scheduledWorking && row?.scheduledTimes)
    .map((row) => row.scheduledTimes);
  const schedule = schedules[0] || {};
  const varies = schedules.some((candidate) =>
    ["morningIn", "morningOut", "afternoonIn", "afternoonOut"].some(
      (field) =>
        String(candidate?.[field] || "") !== String(schedule?.[field] || ""),
    ),
  );
  return {
    amIn: varies ? "VARIES" : schedule.morningIn || "",
    amOut: varies ? "VARIES" : schedule.morningOut || "",
    pmIn: varies ? "VARIES" : schedule.afternoonIn || "",
    pmOut: varies ? "VARIES" : schedule.afternoonOut || "",
  };
}

function writeDtrCopy(sheetXml, dtr, copy, options = {}) {
  const employee = dtr?.employee || {};
  const signatory = dtr?.signatory || {};
  const specialStyles = options.specialStyles || {};
  const timeStyles = options.timeStyles || {};
  const schedule = effectiveSchedule(dtr);

  let output = sheetXml;
  output = setCell(
    output,
    copy.name,
    String(employee.name || "")
      .trim()
      .toUpperCase(),
  );
  output = setCell(output, copy.period, dtr?.period?.periodLabel || "");
  output = setCell(output, copy.amInSchedule, schedule.amIn);
  output = setCell(output, copy.amOutSchedule, schedule.amOut);
  output = setCell(output, copy.pmInSchedule, schedule.pmIn);
  output = setCell(output, copy.pmOutSchedule, schedule.pmOut);
  output = setCell(
    output,
    copy.employeeName,
    formatEmployeeSignatureName(employee).toUpperCase(),
  );
  output = setCell(
    output,
    copy.signatoryName,
    String(signatory.name || "").toUpperCase(),
  );
  output = setCell(
    output,
    copy.signatoryPosition,
    String(signatory.position || "").toUpperCase(),
  );

  for (const row of dtr?.rows || []) {
    const rowNumber = 10 + Number(row.day || 0);
    if (rowNumber < 11 || rowNumber > 41) continue;

    const dayValue = row.inMonth ? row.day : "";
    const specialCode = row.specialCode || (row.isAbsent ? "ABSENT" : "");
    const label = specialCode ? "" : weekendLabel(row);
    const specialKind = specialStyleKind(row);
    const styleFor = (field) =>
      specialStyleId(specialStyles, specialKind, copy[`${field}Style`]) ||
      copy[`${field}Style`];

    output = setCell(
      output,
      `${copy.day}${rowNumber}`,
      dayValue,
      styleFor("day"),
    );

    if (!row.inMonth) {
      for (const field of [
        "amIn",
        "amOut",
        "pmIn",
        "pmOut",
        "undertimeHours",
        "undertimeMinutes",
      ])
        output = setCell(output, `${copy[field]}${rowNumber}`, "", copy[`${field}Style`]);
      continue;
    }

    if (label) {
      output = setCell(output, `${copy.amIn}${rowNumber}`, label, copy.amInStyle);
      for (const field of [
        "amOut",
        "pmIn",
        "pmOut",
        "undertimeHours",
        "undertimeMinutes",
      ])
        output = setCell(output, `${copy[field]}${rowNumber}`, "", copy[`${field}Style`]);
      continue;
    }

    const amIn =
      specialCode === "CTO"
        ? "CTO"
        : specialCode || (row.isActive ? row.amIn || "" : "");
    const amOut = row.isActive ? row.amOut || "" : "";
    const pmIn = row.isActive ? row.pmIn || "" : "";
    const pmOut = row.isActive ? row.pmOut || "" : "";

    output = setCell(
      output,
      `${copy.amIn}${rowNumber}`,
      amIn,
      specialCode ? styleFor("amIn") : timeStyleId(amIn, copy.amInStyle, timeStyles),
    );
    output = setCell(
      output,
      `${copy.amOut}${rowNumber}`,
      specialCode ? "" : amOut,
      specialCode ? styleFor("amOut") : timeStyleId(amOut, copy.amOutStyle, timeStyles),
    );
    output = setCell(
      output,
      `${copy.pmIn}${rowNumber}`,
      specialCode ? "" : pmIn,
      specialCode ? styleFor("pmIn") : timeStyleId(pmIn, copy.pmInStyle, timeStyles),
    );
    output = setCell(
      output,
      `${copy.pmOut}${rowNumber}`,
      specialCode ? "" : pmOut,
      specialCode ? styleFor("pmOut") : timeStyleId(pmOut, copy.pmOutStyle, timeStyles),
    );
    output = setCell(
      output,
      `${copy.undertimeHours}${rowNumber}`,
      specialCode ? "" : row.undertimeHours || "",
      styleFor("undertimeHours"),
    );
    output = setCell(
      output,
      `${copy.undertimeMinutes}${rowNumber}`,
      specialCode ? "" : row.undertimeMinutes || "",
      styleFor("undertimeMinutes"),
    );
  }

  return output;
}

function addDtrWatermark(sheetXml, verificationId) {
  const watermark = `&C&KCCCCCC&28SYSTEM GENERATED DTR\n&12Verification ID: ${verificationId}`;
  const headerFooter = `<headerFooter><oddHeader>${xmlEscape(watermark)}</oddHeader><oddFooter>&amp;CGenerated by VeriFace • ${xmlEscape(verificationId)}</oddFooter></headerFooter>`;
  return /<headerFooter\b[^>]*(?:\/>|>[\s\S]*?<\/headerFooter>)/.test(sheetXml)
    ? sheetXml.replace(
        /<headerFooter\b[^>]*(?:\/>|>[\s\S]*?<\/headerFooter>)/,
        headerFooter,
      )
    : sheetXml.replace("</worksheet>", `${headerFooter}</worksheet>`);
}

function buildSheetXml(templateSheetXml, dtr, options = {}) {
  const filled = COPY_DEFINITIONS.reduce(
    (xml, copy) => writeDtrCopy(xml, dtr, copy, options),
    templateSheetXml,
  );
  return addDtrWatermark(filled, options.verificationId);
}

function sanitizeSheetName(value, fallback) {
  const raw = String(value || fallback || "DTR")
    .replace(/[\[\]:*?/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (raw || fallback || "DTR").slice(0, 31);
}

function uniqueSheetName(baseName, usedNames) {
  const sanitized = sanitizeSheetName(baseName, "DTR");
  if (!usedNames.has(sanitized.toLowerCase())) {
    usedNames.add(sanitized.toLowerCase());
    return sanitized;
  }

  for (let index = 2; index < 1000; index += 1) {
    const suffix = ` ${index}`;
    const candidate = `${sanitized.slice(0, 31 - suffix.length)}${suffix}`;
    if (!usedNames.has(candidate.toLowerCase())) {
      usedNames.add(candidate.toLowerCase());
      return candidate;
    }
  }

  return sanitized;
}

function buildSheetEntries(dtrs) {
  const usedNames = new Set();
  const dtrSheets = dtrs.map((dtr, index) => {
    const employee = dtr?.employee || {};
    return {
      dtr,
      index: index + 1,
      name: uniqueSheetName(
        `${employee.employeeId || index + 1} ${employee.name || ""}`,
        usedNames,
      ),
      relId: `rIdDtrSheet${index + 1}`,
      path: `xl/worksheets/sheet${index + 1}.xml`,
      relsPath: `xl/worksheets/_rels/sheet${index + 1}.xml.rels`,
    };
  });

  const timeLogDetails = dtrs
    .flatMap((dtr) =>
      (dtr?.timeLogDetails || []).map((entry) => ({
        department:
          dtr?.employee?.divisionName || dtr?.employee?.office || "Unassigned",
        employeeId: dtr?.employee?.employeeId || "",
        employeeName: dtr?.employee?.name || "",
        ...entry,
      })),
    )
    .sort(
      (left, right) =>
        left.department.localeCompare(right.department) ||
        left.employeeName.localeCompare(right.employeeName) ||
        left.employeeId.localeCompare(right.employeeId) ||
        left.dateKey.localeCompare(right.dateKey) ||
        left.timestamp - right.timestamp,
    );
  if (timeLogDetails.length === 0) return dtrSheets;

  const index = dtrSheets.length + 1;
  return [
    ...dtrSheets,
    {
      kind: "remarks",
      remarks: timeLogDetails,
      index,
      name: uniqueSheetName("Time Log Details", usedNames),
      relId: `rIdDtrSheet${index}`,
      path: `xl/worksheets/sheet${index}.xml`,
      relsPath: `xl/worksheets/_rels/sheet${index}.xml.rels`,
    },
  ];
}

function buildRemarksSheetXml(remarks = []) {
  const rows = [
    [
      "Department",
      "Employee Name",
      "Employee ID",
      "Date",
      "Time",
      "Entry",
      "Source",
      "Remarks",
    ],
    ...remarks.map((remark) => [
      remark.department || "Unassigned",
      remark.employeeName || "",
      remark.employeeId || "",
      remark.dateKey || "",
      remark.time || "",
      remark.action === "checkin"
        ? "Check in"
        : remark.action === "checkout"
          ? "Check out"
          : "Attendance log",
      remark.source || "System scan",
      remark.remark || "",
    ]),
  ];
  const columnNames = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const body = rows
    .map((values, rowIndex) => {
      const cells = values
        .map((value, columnIndex) =>
          buildCellXml(
            `${columnNames[columnIndex]}${rowIndex + 1}`,
            value,
            rowIndex === 0 ? "1" : "",
          ),
        )
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:H${rows.length}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="24" customWidth="1"/><col min="2" max="2" width="28" customWidth="1"/><col min="3" max="3" width="16" customWidth="1"/><col min="4" max="5" width="14" customWidth="1"/><col min="6" max="7" width="18" customWidth="1"/><col min="8" max="8" width="60" customWidth="1"/></cols><sheetData>${body}</sheetData><autoFilter ref="A1:H${rows.length}"/></worksheet>`;
}

function sheetNameForFormula(name) {
  return `'${String(name || "DTR").replace(/'/g, "''")}'`;
}

function replaceSheetsXml(workbookXml, sheets) {
  const sheetsXml = sheets
    .map(
      (sheet) =>
        `<sheet name="${xmlEscape(sheet.name)}" sheetId="${sheet.index}" r:id="${sheet.relId}"/>`,
    )
    .join("");

  const definedNamesXml = `<definedNames>${sheets
    .map(
      (sheet, index) =>
        `<definedName name="_xlnm.Print_Area" localSheetId="${index}">${sheetNameForFormula(sheet.name)}!${sheet.kind === "remarks" ? "$A$1:$H$" + (sheet.remarks.length + 1) : "$A$1:$O$58"}</definedName>`,
    )
    .join("")}</definedNames>`;

  let output = workbookXml.replace(
    /<sheets>[\s\S]*?<\/sheets>/,
    `<sheets>${sheetsXml}</sheets>`,
  );

  if (/<definedNames>[\s\S]*?<\/definedNames>/.test(output)) {
    output = output.replace(
      /<definedNames>[\s\S]*?<\/definedNames>/,
      definedNamesXml,
    );
  } else {
    output = output.replace("</workbook>", `${definedNamesXml}</workbook>`);
  }

  return output;
}

function replaceWorkbookRelsXml(relsXml, sheets) {
  const preserved = [...relsXml.matchAll(/<Relationship\b[^>]*\/>/g)]
    .map((match) => match[0])
    .filter(
      (relationship) => !relationship.includes(`Type="${WORKSHEET_REL_TYPE}"`),
    )
    .filter(
      (relationship) => !relationship.includes(`Type="${CALC_CHAIN_REL_TYPE}"`),
    )
    .join("");

  const worksheetRels = sheets
    .map(
      (sheet) =>
        `<Relationship Id="${sheet.relId}" Type="${WORKSHEET_REL_TYPE}" Target="worksheets/sheet${sheet.index}.xml"/>`,
    )
    .join("");

  return relsXml.replace(
    /<Relationships\b([^>]*)>[\s\S]*?<\/Relationships>/,
    `<Relationships$1>${preserved}${worksheetRels}</Relationships>`,
  );
}

function replaceContentTypesXml(contentTypesXml, sheets) {
  const withoutWorksheets = contentTypesXml
    .replace(
      new RegExp(
        `<Override\\b[^>]*ContentType="${regexEscape(WORKSHEET_CONTENT_TYPE)}"[^>]*/>`,
        "g",
      ),
      "",
    )
    .replace(
      new RegExp(
        `<Override\\b[^>]*ContentType="${regexEscape(CALC_CHAIN_CONTENT_TYPE)}"[^>]*/>`,
        "g",
      ),
      "",
    );

  const worksheetOverrides = sheets
    .map(
      (sheet) =>
        `<Override PartName="/xl/worksheets/sheet${sheet.index}.xml" ContentType="${WORKSHEET_CONTENT_TYPE}"/>`,
    )
    .join("");

  return withoutWorksheets.replace("</Types>", `${worksheetOverrides}</Types>`);
}

function replaceAppXml(appXml, sheets) {
  const sheetNames = sheets.map((sheet) => sheet.name);
  let output = appXml;

  output = output.replace(
    /<TitlesOfParts><vt:vector\b[^>]*>[\s\S]*?<\/vt:vector><\/TitlesOfParts>/,
    `<TitlesOfParts><vt:vector size="${sheetNames.length}" baseType="lpstr">${sheetNames.map((name) => `<vt:lpstr>${xmlEscape(name)}</vt:lpstr>`).join("")}</vt:vector></TitlesOfParts>`,
  );

  output = output.replace(
    /<HeadingPairs><vt:vector\b[^>]*>[\s\S]*?<\/vt:vector><\/HeadingPairs>/,
    `<HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${sheetNames.length}</vt:i4></vt:variant></vt:vector></HeadingPairs>`,
  );

  return output;
}

export async function loadDtrTemplateBytes() {
  return new Uint8Array(
    await readFile(new URL(TEMPLATE_PATH, import.meta.url)),
  );
}

export function buildDtrWorkbookFromTemplate(templateBytes, dtrs = []) {
  const documents = Array.isArray(dtrs) ? dtrs.filter(Boolean) : [];
  if (documents.length === 0) {
    throw new Error("At least one DTR document is required.");
  }

  const files = unzipSync(templateBytes);
  const templateSheetXml = new TextDecoder().decode(
    files[SHEET_XML_TEMPLATE_PATH],
  );
  const templateSheetRels = files[SHEET_RELS_TEMPLATE_PATH];
  const workbookXml = new TextDecoder().decode(files["xl/workbook.xml"]);
  const timeStyleResult = appendDtrTimeValueStyles(
    new TextDecoder().decode(files[STYLES_XML_PATH]),
  );
  const styleResult = appendDtrSpecialStyles(timeStyleResult.stylesXml);
  const sheets = buildSheetEntries(documents);
  const verificationId = `FA-${crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`;

  for (const path of Object.keys(files)) {
    if (
      /^xl\/worksheets\/sheet\d+\.xml$/.test(path) ||
      /^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/.test(path)
    ) {
      delete files[path];
    }
  }

  delete files["xl/calcChain.xml"];

  for (const sheet of sheets) {
    files[sheet.path] = strToU8(
      sheet.kind === "remarks"
        ? buildRemarksSheetXml(sheet.remarks)
        : buildSheetXml(templateSheetXml, sheet.dtr, {
            specialStyles: styleResult.specialStyles,
            timeStyles: timeStyleResult.timeStyles,
            verificationId,
          }),
    );
    if (templateSheetRels && sheet.kind !== "remarks") {
      files[sheet.relsPath] = templateSheetRels;
    }
  }

  files[STYLES_XML_PATH] = strToU8(styleResult.stylesXml);
  files["xl/workbook.xml"] = strToU8(replaceSheetsXml(workbookXml, sheets));
  files["xl/_rels/workbook.xml.rels"] = strToU8(
    replaceWorkbookRelsXml(
      new TextDecoder().decode(files["xl/_rels/workbook.xml.rels"]),
      sheets,
    ),
  );
  files["[Content_Types].xml"] = strToU8(
    replaceContentTypesXml(
      new TextDecoder().decode(files["[Content_Types].xml"]),
      sheets,
    ),
  );

  if (files["docProps/app.xml"]) {
    files["docProps/app.xml"] = strToU8(
      replaceAppXml(
        new TextDecoder().decode(files["docProps/app.xml"]),
        sheets,
      ),
    );
  }

  return zipSync(files, { level: 6 });
}

export async function buildDtrWorkbookBytes(dtrs = []) {
  return buildDtrWorkbookFromTemplate(await loadDtrTemplateBytes(), dtrs);
}

export function buildDtrWorkbookFilename(
  dtrs = [],
  { month, year, rangeLabel } = {},
) {
  const documents = Array.isArray(dtrs) ? dtrs.filter(Boolean) : [];
  const first = documents[0] || {};
  const range = rangeLabel || first.rangeSpec?.label || "full";
  const monthLabel =
    DTR_EXCEL_MONTH_NAMES[(month || first.period?.month || 1) - 1] || "Month";
  const targetYear = year || first.period?.year || new Date().getFullYear();

  if (documents.length === 1) {
    const employeeId = first.employee?.employeeId || "employee";
    return `DTR_${employeeId}_${monthLabel}_${targetYear}_${range}.xlsx`;
  }

  return `DTR_${monthLabel}_${targetYear}_${range}_${documents.length}employees.xlsx`;
}

export function createDtrWorkbookResponse(bytes, filename) {
  return new Response(bytes, {
    headers: {
      "Content-Type": DTR_EXCEL_MIME,
      "Content-Disposition": `attachment; filename="${String(filename || "DTR.xlsx").replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}
