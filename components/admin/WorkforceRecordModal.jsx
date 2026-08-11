"use client";

import { useEffect, useMemo, useState } from "react";
import { Field } from "@/components/shared/ui";

const LEAVE_LABELS = {
  VL: "Vacation Leave",
  SL: "Sick Leave",
  CTO: "Compensatory Time Off",
  WL: "Wellness Leave",
};

function employeeMatches(person, search) {
  const haystack = [person.name, person.employeeId, person.officeName, person.divisionName]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(search.toLowerCase());
}

export default function WorkforceRecordModal({
  tab,
  editing,
  employees,
  form,
  onClose,
  onSubmit,
  saving = false,
  update,
}) {
  const [search, setSearch] = useState("");

  useEffect(() => {
    setSearch("");
  }, [editing, tab]);

  const isOrder = tab === "order";
  const selectedIds = useMemo(
    () => (isOrder ? form.personIds || [] : form.personId ? [form.personId] : []),
    [form.personId, form.personIds, isOrder],
  );
  const visibleEmployees = useMemo(
    () => employees.filter((person) => employeeMatches(person, search)),
    [employees, search],
  );
  const selectedEmployees = employees.filter((person) => selectedIds.includes(person.id));

  const toggleEmployee = (personId) => {
    if (!isOrder) {
      if (editing !== "new") return;
      update("personId", personId);
      return;
    }
    update(
      "personIds",
      selectedIds.includes(personId)
        ? selectedIds.filter((id) => id !== personId)
        : [...selectedIds, personId],
    );
  };

  const title = `${editing === "new" ? "New" : "Edit"} ${isOrder ? "Official Order" : "Leave"}`;

  return (
    <div
      aria-labelledby="workforce-record-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
    >
      <form
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl sm:max-h-[calc(100dvh-3rem)]"
        onSubmit={onSubmit}
      >
        <header className="flex items-start justify-between gap-4 border-b border-black/10 px-5 py-4 sm:px-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-navy-dark">Attendance record</p>
            <h2 className="mt-1 text-2xl font-bold text-ink" id="workforce-record-title">{title}</h2>
            <p className="mt-1 text-sm text-muted">
              {isOrder
                ? "One Official Order may cover any number of employees within your authorized scope."
                : "Record an employee leave period without changing their attendance punches."}
            </p>
          </div>
          <button className="rounded-xl border border-black/10 px-3 py-2 text-sm font-semibold" onClick={onClose} type="button">
            Close
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto p-5 lg:grid-cols-[minmax(300px,0.75fr)_minmax(420px,1.25fr)] sm:p-7">
          <div className="grid content-start gap-4">
            {isOrder ? (
              <>
                <Field label="Order type">
                  <input className="w-full rounded-xl border border-black/10 px-3 py-2" onChange={(event) => update("orderType", event.target.value)} required value={form.orderType || ""} />
                </Field>
                <Field label="Order number">
                  <input className="w-full rounded-xl border border-black/10 px-3 py-2" onChange={(event) => update("orderNumber", event.target.value)} value={form.orderNumber || ""} />
                </Field>
              </>
            ) : (
              <Field label="Leave type">
                <select className="w-full rounded-xl border border-black/10 px-3 py-2" onChange={(event) => update("leaveType", event.target.value)} value={form.leaveType || "VL"}>
                  {Object.entries(LEAVE_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
                </select>
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start date">
                <input className="w-full rounded-xl border border-black/10 px-3 py-2" onChange={(event) => update("startDate", event.target.value)} required type="date" value={form.startDate || ""} />
              </Field>
              <Field label="End date">
                <input className="w-full rounded-xl border border-black/10 px-3 py-2" onChange={(event) => update("endDate", event.target.value)} required type="date" value={form.endDate || ""} />
              </Field>
            </div>
            <Field label="Remarks">
              <textarea className="min-h-28 w-full rounded-xl border border-black/10 px-3 py-2" onChange={(event) => update("remarks", event.target.value)} value={form.remarks || ""} />
            </Field>
          </div>

          <section className="flex min-h-0 flex-col rounded-2xl border border-black/10 bg-stone-50 p-3 sm:p-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="font-bold text-ink">{isOrder ? "Employees covered" : "Employee on leave"}</h3>
                <p className="mt-0.5 text-xs text-muted">
                  {isOrder ? `${selectedIds.length} selected` : editing === "new" ? "Select one employee" : "The employee cannot be changed after the leave is saved."}
                </p>
              </div>
              <input aria-label="Search employees" className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm sm:w-64" onChange={(event) => setSearch(event.target.value)} placeholder="Search name, ID, office" value={search} />
            </div>
            {selectedEmployees.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedEmployees.map((person) => (
                  <span className="inline-flex items-center gap-1 rounded-full bg-navy px-2.5 py-1 text-xs font-medium text-white" key={person.id}>
                    {person.name}
                    {isOrder ? <button aria-label={`Remove ${person.name}`} className="ml-1 rounded-full px-1 hover:bg-white/20" onClick={() => toggleEmployee(person.id)} type="button">×</button> : null}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border border-black/10 bg-white">
              {visibleEmployees.length ? visibleEmployees.map((person) => {
                const selected = selectedIds.includes(person.id);
                return (
                  <button
                    aria-pressed={selected}
                    className={`flex w-full items-center gap-3 border-b border-black/5 px-3 py-3 text-left last:border-b-0 ${selected ? "bg-navy/[0.07]" : "hover:bg-stone-50"} ${!isOrder && editing !== "new" ? "cursor-not-allowed opacity-60" : ""}`}
                    disabled={!isOrder && editing !== "new"}
                    key={person.id}
                    onClick={() => toggleEmployee(person.id)}
                    type="button"
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center border ${isOrder ? "rounded" : "rounded-full"} ${selected ? "border-navy bg-navy text-white" : "border-black/20 bg-white"}`}>{selected ? "✓" : ""}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-ink">{person.name}</span>
                      <span className="block truncate text-xs text-muted">{[person.employeeId, person.officeName, person.divisionName].filter(Boolean).join(" · ")}</span>
                    </span>
                  </button>
                );
              }) : <p className="p-5 text-sm text-muted">No matching employees in your authorized scope.</p>}
            </div>
          </section>
        </div>

        <footer className="flex justify-end gap-2 border-t border-black/10 px-5 py-4 sm:px-7">
          <button className="rounded-xl border border-black/10 px-4 py-2 font-semibold disabled:opacity-50" disabled={saving} onClick={onClose} type="button">Cancel</button>
          <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-navy px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={saving || selectedIds.length === 0} type="submit">{saving ? <><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />Saving…</> : <>Save {isOrder ? "Official Order" : "Leave"}</>}</button>
        </footer>
      </form>
    </div>
  );
}
