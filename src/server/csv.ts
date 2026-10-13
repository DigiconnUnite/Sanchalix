import 'server-only';
import writeXlsxFile from 'write-excel-file/node';

type Cell = string | number | null;
export type FileFormat = 'csv' | 'xlsx';

export const fileFormat = (value: string | null): FileFormat => (value === 'xlsx' ? 'xlsx' : 'csv');

// A cell starting with = + - or @ would run as a formula in a spreadsheet, so it is made plain text.
const cell = (value: Cell) => {
  const text = value === null ? '' : String(value);
  const safe = typeof value === 'string' && /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

const download = (body: BodyInit, type: string, fileName: string) =>
  new Response(body, {
    headers: {
      'Content-Type': type,
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });

/** A CSV download. The BOM makes Excel read the file as UTF-8, so names and the rupee sign survive. */
export const csvResponse = (fileName: string, rows: Cell[][]) =>
  download(`﻿${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`, 'text/csv; charset=utf-8', fileName);

/**
 * A table as a file to download, as CSV or as an Excel workbook with a bold first row. In a workbook every text cell
 * is stored as text, so nothing a user typed can run as a formula.
 */
export async function tableResponse(format: FileFormat, baseName: string, rows: Cell[][]) {
  if (format === 'csv') return csvResponse(`${baseName}.csv`, rows);
  const sheet = rows.map((row, index) =>
    row.map((value) =>
      typeof value === 'number'
        ? { value, type: Number, ...(index === 0 && { fontWeight: 'bold' as const }) }
        : { value: value ?? '', type: String, ...(index === 0 && { fontWeight: 'bold' as const }) },
    ),
  );
  const workbook = await writeXlsxFile(sheet).toBuffer();
  return download(
    new Uint8Array(workbook),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    `${baseName}.xlsx`,
  );
}
