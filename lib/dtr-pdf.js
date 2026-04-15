'use client'

/**
 * Downloads the rendered DTR as a PDF file.
 * Targets .form48-container element in the DOM.
 * @param {string} filename - PDF filename without extension
 * @param {Element|string|null} target - Optional DOM element or selector
 */
export async function downloadDtrPdf(filename = 'DTR', target = '.form48-container', pdfOptions = {}) {
  const html2pdf = (await import('html2pdf.js')).default
  const element = typeof target === 'string'
    ? document.querySelector(target)
    : target
  if (!element) {
    console.error('No DTR render target found in DOM')
    return
  }

  const opt = {
    margin: [0, 0, 0, 0],
    filename: `${filename}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, letterRendering: true, backgroundColor: '#ffffff' },
    jsPDF: { unit: 'in', format: 'a4', orientation: pdfOptions.orientation || 'portrait' },
    pagebreak: { mode: ['css', 'legacy'], before: '.print\\:break-before-page' },
  }

  await html2pdf().set(opt).from(element).save()
}
