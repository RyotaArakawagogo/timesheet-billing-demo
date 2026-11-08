/** Browser-only: turn an InvoiceResult into files. All numbers come from the InvoiceResult. */
import type { InvoiceResult } from '../domain/billing.ts';
import { csvFileName, invoiceToCsv } from '../export/csv.ts';
import { buildInvoicePdf, pdfFileName } from '../export/pdf.ts';

type PdfMake = typeof import('pdfmake/build/pdfmake');

let pdfMakePromise: Promise<PdfMake> | null = null;

/** pdfmake and its fonts (~1 MB) are loaded only when a PDF is first requested. */
function loadPdfMake(): Promise<PdfMake> {
  pdfMakePromise ??= (async () => {
    const mod = (await import('pdfmake/build/pdfmake')) as PdfMake & { default?: PdfMake };
    const pdfMake = mod.default ?? mod;
    const fonts = (await import('pdfmake/build/vfs_fonts')) as unknown as { default?: Record<string, string> };
    pdfMake.addVirtualFileSystem(fonts.default ?? (fonts as unknown as Record<string, string>));
    return pdfMake;
  })();
  return pdfMakePromise;
}

export async function downloadInvoicePdf(inv: InvoiceResult): Promise<void> {
  const def = buildInvoicePdf(inv); // throws for a blocked invoice
  const pdfMake = await loadPdfMake();
  await pdfMake.createPdf(def).download(pdfFileName(inv));
}

export function downloadInvoiceCsv(inv: InvoiceResult): void {
  const text = invoiceToCsv(inv); // throws for a blocked invoice
  // BOM so spreadsheet apps read UTF-8 names (e.g. "Fernández") correctly.
  const blob = new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = csvFileName(inv);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
