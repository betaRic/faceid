'use client'

import { useCallback, useState } from 'react'
import { useAdminStore } from '@/lib/admin/store'
import {
  buildEmployeeAccessCodeWorkbookBlob,
  employeeAccessCodeExportFilename,
  groupEmployeesByOffice,
} from '@/lib/employee-access-code-export'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function buildPrintableDocument(groups, generatedAt) {
  const sections = groups.length
    ? groups.map(group => `
      <section>
        <h2>${escapeHtml(group.officeName)}</h2>
        <table>
          <thead><tr><th>Access Code</th><th>Complete Name</th></tr></thead>
          <tbody>${group.employees.map(employee => `<tr><td>${escapeHtml(employee.accessCode)}</td><td>${escapeHtml(employee.completeName)}</td></tr>`).join('')}</tbody>
        </table>
      </section>
    `).join('')
    : '<p>No employee records found.</p>'

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>VeriFace Employee Access Codes</title>
<style>
  @page { size: A4 portrait; margin: 13mm; }
  * { box-sizing: border-box; }
  body { color: #182230; font-family: Arial, sans-serif; font-size: 10pt; margin: 0; }
  h1 { color: #17365d; font-size: 18pt; margin: 0 0 4px; }
  .generated { color: #5d6673; font-size: 8.5pt; margin: 0 0 16px; }
  section { break-inside: avoid; margin: 0 0 18px; }
  h2 { background: #1f4e78; color: #fff; font-size: 11pt; margin: 0; padding: 7px 9px; }
  table { border-collapse: collapse; width: 100%; }
  th { background: #d9eaf7; color: #17365d; font-size: 9pt; text-align: left; }
  th, td { border: 1px solid #b7c9d6; padding: 6px 8px; }
  th:first-child, td:first-child { width: 30%; }
  @media print { thead { display: table-header-group; } }
</style></head><body>
  <h1>VeriFace Employee Access Codes</h1>
  <p class="generated">Generated: ${escapeHtml(generatedAt)}</p>
  ${sections}
</body></html>`
}

async function loadEmployeesForExport(endpoint, resultKey) {
  const response = await fetch(endpoint, { credentials: 'same-origin' })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.ok) throw new Error(data.message || 'Unable to load employee records.')
  return Array.isArray(data[resultKey]) ? data[resultKey] : []
}

export default function EmployeeAccessCodeExportActions({ endpoint = '/api/persons', resultKey = 'persons' }) {
  const addToast = useAdminStore((state) => state.addToast)
  const [busyAction, setBusyAction] = useState('')

  const generateExcel = useCallback(async () => {
    setBusyAction('excel')
    try {
      const persons = await loadEmployeesForExport(endpoint, resultKey)
      const blob = buildEmployeeAccessCodeWorkbookBlob(persons)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = employeeAccessCodeExportFilename()
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 0)
      addToast(`Excel file generated for ${persons.length} employee${persons.length === 1 ? '' : 's'}.`, 'success')
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Unable to generate the Excel file.', 'error')
    } finally {
      setBusyAction('')
    }
  }, [addToast, endpoint, resultKey])

  const printPdf = useCallback(async () => {
    // Open synchronously from the click to avoid browser popup blocking.
    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      addToast('Your browser blocked the print window. Please allow popups for this site and try again.', 'error')
      return
    }
    printWindow.opener = null

    setBusyAction('print')
    printWindow.document.write('<p style="font-family:Arial,sans-serif;padding:24px">Preparing employee access-code list…</p>')
    try {
      const persons = await loadEmployeesForExport(endpoint, resultKey)
      const generatedAt = new Date().toLocaleString('en-PH')
      printWindow.document.open()
      printWindow.document.write(buildPrintableDocument(groupEmployeesByOffice(persons), generatedAt))
      printWindow.document.close()
      window.setTimeout(() => printWindow.print(), 250)
    } catch (error) {
      printWindow.close()
      addToast(error instanceof Error ? error.message : 'Unable to prepare the printout.', 'error')
    } finally {
      setBusyAction('')
    }
  }, [addToast, endpoint, resultKey])

  const disabled = Boolean(busyAction)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-full text-xs text-muted sm:w-auto">All employees in your access scope</span>
      <button
        className="rounded-full border border-navy/20 bg-white px-3 py-1.5 text-xs font-semibold text-navy transition hover:bg-navy/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        onClick={generateExcel}
        type="button"
      >
        {busyAction === 'excel' ? 'Generating…' : 'Generate Excel'}
      </button>
      <button
        className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled}
        onClick={printPdf}
        type="button"
      >
        {busyAction === 'print' ? 'Preparing…' : 'Print / Save PDF'}
      </button>
    </div>
  )
}
