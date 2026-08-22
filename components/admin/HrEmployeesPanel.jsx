"use client";

import { memo, useEffect } from "react";
import { motion } from "framer-motion";
import { startTransition } from "react";
import { useHrEmployees } from "@/lib/hr/hooks";
import { useAdminStore } from "@/lib/admin/store";
import { Badge } from "@/components/shared/ui";
import EmployeeAccessCodeExportActions from "./EmployeeAccessCodeExportActions";

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-5 py-4">
        <div className="h-10 w-10 rounded-full bg-stone-200" />
      </td>
      <td className="px-5 py-4">
        <div className="h-4 w-24 rounded bg-stone-200" />
      </td>
      <td className="px-5 py-4">
        <div className="h-4 w-20 rounded bg-stone-200" />
      </td>
      <td className="px-5 py-4">
        <div className="h-6 w-16 rounded-full bg-stone-200" />
      </td>
      <td className="px-5 py-4">
        <div className="h-6 w-16 rounded-full bg-stone-200" />
      </td>
    </tr>
  );
}

function LifecycleBadge({ status }) {
  const lifecycle = String(status || "").toLowerCase();
  const tone =
    lifecycle === "active"
      ? "bg-emerald-100 text-emerald-800"
      : lifecycle === "pending"
        ? "bg-amber-100 text-amber-800"
        : lifecycle === "rejected"
          ? "bg-red-100 text-red-800"
          : "bg-stone-200 text-stone-700";
  const label =
    lifecycle === "active"
      ? "Active"
      : lifecycle === "pending"
        ? "Pending review"
        : lifecycle === "rejected"
          ? "Rejected"
          : "Inactive";
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${tone}`}>
      {label}
    </span>
  );
}

function HrEmployeesPanelInner() {
  const employeeRefreshKey = useAdminStore((state) => state.employeeRefreshKey);
  const setEditingEmployee = useAdminStore((state) => state.setEditingEmployee);
  const setDeletingEmployee = useAdminStore(
    (state) => state.setDeletingEmployee,
  );
  const {
    employees,
    employeesLoaded,
    employeeTotal,
    employeeQuery,
    setEmployeeQuery,
    employeeStatusFilter,
    setEmployeeStatusFilter,
    employeePage,
    employeeHasMore,
    handlePreviousPage,
    handleNextPage,
    fetchEmployees,
    loading,
  } = useHrEmployees();

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees, employeeRefreshKey]);

  return (
    <motion.section
      animate={{ opacity: 1, y: 0 }}
      className="flex min-h-0 flex-col gap-3 bg-white p-3 sm:gap-5 sm:p-6 md:h-full md:overflow-hidden"
      initial={{ opacity: 0, y: 18 }}
      transition={{ duration: 0.35 }}
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(150px,0.55fr)_minmax(0,1.8fr)] lg:items-end">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-widest text-navy-dark">
            HR
          </div>
          <h2 className="mt-1 font-display text-2xl font-bold text-ink sm:text-3xl">
            Employees
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-xs font-semibold text-muted mb-1">
              Search
            </label>
            <input
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy"
              onChange={(e) => {
                startTransition(() => setEmployeeQuery(e.target.value));
              }}
              placeholder="Name or ID"
              value={employeeQuery}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">
              Status
            </label>
            <select
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none transition focus:border-navy"
              onChange={(e) => setEmployeeStatusFilter(e.target.value)}
              value={employeeStatusFilter}
            >
              <option value="">All status</option>
              <option value="active">Active</option>
              <option value="pending">Pending review</option>
              <option value="inactive">Inactive</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-black/5 bg-stone-50 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <span className="text-muted">
          {employeesLoaded ? `${employeeTotal} employees` : "Loading..."}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold text-ink hover:bg-stone-100 disabled:opacity-40"
            disabled={employeePage <= 1}
            onClick={handlePreviousPage}
          >
            Prev
          </button>
          <span className="text-xs text-muted">Page {employeePage}</span>
          <button
            className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold text-ink hover:bg-stone-100 disabled:opacity-40"
            disabled={!employeeHasMore}
            onClick={handleNextPage}
          >
            Next
          </button>
          <button
            className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold text-ink hover:bg-stone-100"
            onClick={fetchEmployees}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-navy/10 bg-navy/[0.025] px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div>
          <div className="text-sm font-semibold text-ink">
            Employee access-code list
          </div>
          <div className="text-xs text-muted">
            Grouped by Office Assignment and alphabetized by Complete Name.
          </div>
        </div>
        <EmployeeAccessCodeExportActions
          endpoint="/api/hr/employees?mode=access-codes"
          resultKey="employees"
        />
      </div>

      <div className="rounded-xl border border-black/5 md:min-h-0 md:flex-1 md:overflow-auto">
        <div className="divide-y divide-black/5 bg-white md:hidden">
          {loading && !employeesLoaded ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="animate-pulse px-4 py-4">
                <div className="h-4 w-32 rounded bg-stone-200" />
                <div className="mt-3 h-3 w-24 rounded bg-stone-200" />
              </div>
            ))
          ) : employees.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted">
              No employees match the current filters.
            </div>
          ) : (
            employees.map((person) => (
              <div key={person.id} className="grid gap-3 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-ink">
                      {person.name}
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-wider text-muted">
                      {person.employeeId}
                    </div>
                  </div>
                  <LifecycleBadge status={person.lifecycleStatus} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{person.officeName}</Badge>
                </div>
                <div className="flex gap-2">
                  <button
                    className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-stone-100"
                    onClick={() => setEditingEmployee(person)}
                    type="button"
                  >
                    Edit
                  </button>
                  {person.lifecycleStatus === 'active' ? (
                    <button
                      className="rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                      onClick={() => setDeletingEmployee(person)}
                      type="button"
                    >
                      Deactivate
                    </button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>

        <table className="hidden w-full text-left text-sm md:table">
          <thead className="sticky top-0 bg-stone-100 text-xs uppercase tracking-widest text-muted">
            <tr>
              <th className="px-5 py-3">Employee</th>
              <th className="px-5 py-3">Office</th>
              <th className="px-5 py-3">Lifecycle</th>
              <th className="px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5 bg-white">
            {loading && !employeesLoaded ? (
              Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
            ) : employees.length === 0 ? (
              <tr>
                <td className="px-5 py-10 text-center text-muted" colSpan={4}>
                  No employees match the current filters.
                </td>
              </tr>
            ) : (
              employees.map((person) => (
                <tr key={person.id} className="bg-white">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-navy/10 text-sm font-bold text-navy-dark">
                        {String(person.name || "?")[0]}
                      </div>
                      <div>
                        <div className="font-medium text-ink">
                          {person.name}
                        </div>
                        <div className="text-xs uppercase tracking-wider text-muted">
                          {person.employeeId}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted">{person.officeName}</td>
                  <td className="px-5 py-3">
                    <LifecycleBadge status={person.lifecycleStatus} />
                  </td>
                  <td className="px-5 py-3">
                    <button
                      className="mr-2 rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold text-ink transition hover:bg-stone-100"
                      onClick={() => setEditingEmployee(person)}
                      type="button"
                    >
                      Edit
                    </button>
                    {person.lifecycleStatus === 'active' ? (
                      <button
                        className="rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                        onClick={() => setDeletingEmployee(person)}
                        type="button"
                      >
                        Deactivate
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </motion.section>
  );
}

export const HrEmployeesPanel = memo(HrEmployeesPanelInner);
