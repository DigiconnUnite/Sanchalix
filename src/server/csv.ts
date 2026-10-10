import 'server-only';

type Cell = string | number | null;

// A cell starting with = + - or @ would run as a formula in a spreadsheet, so it is made plain text.
const cell = (value: Cell) => {
  const text = value === null ? '' : String(value);
  const safe = typeof value === 'string' && /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

/** A CSV download. The BOM makes Excel read the file as UTF-8, so names and the rupee sign survive. */
export function csvResponse(fileName: string, rows: Cell[][]) {
  return new Response(`﻿${rows.map((row) => row.map(cell).join(',')).join('\r\n')}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}
