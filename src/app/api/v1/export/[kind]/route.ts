import { getTranslations } from 'next-intl/server';
import { AppError } from '@/lib/appError';
import { audit } from '@/server/audit';
import { type RequestContext, requirePermission } from '@/server/auth/context';
import type { Permission } from '@/server/auth/permissions';
import { listDues, listPayments } from '@/server/modules/fees/queries';
import { listStudents } from '@/server/modules/sis/queries';

const STATUS = { UNAUTHENTICATED: 401, FORBIDDEN: 403 } as const;
const PAGE = 100;
// ponytail: built in memory in the request, so capped. Move to a background job and a file download past this.
const MAX_ROWS = 10_000;

type Cell = string | number | null;
type Page = { rows: Cell[][]; nextCursor: string | null };
type Export = { permission: Permission; columns: string[]; page: (ctx: RequestContext, cursor?: string) => Promise<Page> };

const rupees = (minor: number) => (minor / 100).toFixed(2);

const EXPORTS: Record<string, Export> = {
  students: {
    permission: 'sis.student.read',
    columns: ['admissionNo', 'name', 'classSection', 'rollNo', 'guardianName', 'guardianPhone', 'status'],
    page: async (ctx, cursor) => {
      const { rows, nextCursor } = await listStudents(ctx, { status: 'active', pageSize: PAGE, cursor });
      return {
        nextCursor,
        rows: rows.map((row) => [
          row.admissionNo,
          row.name,
          row.classSection,
          row.rollNo,
          row.guardianName,
          row.guardianPhone,
          row.status,
        ]),
      };
    },
  },
  dues: {
    permission: 'fees.invoice.read',
    columns: ['invoiceNo', 'admissionNo', 'name', 'installment', 'dueDate', 'daysOverdue', 'balance'],
    page: async (ctx, cursor) => {
      const { rows, nextCursor } = await listDues(ctx, { ageing: 'all', pageSize: PAGE, cursor });
      return {
        nextCursor,
        rows: rows.map((row) => [
          row.invoiceNo,
          row.admissionNo,
          row.studentName,
          row.installment,
          row.dueDate,
          row.daysOverdue,
          rupees(row.balanceMinor),
        ]),
      };
    },
  },
  payments: {
    permission: 'fees.payment.read',
    columns: ['receiptNo', 'collectedAt', 'admissionNo', 'name', 'method', 'amount'],
    page: async (ctx, cursor) => {
      const { rows, nextCursor } = await listPayments(ctx, { pageSize: PAGE, cursor });
      return {
        nextCursor,
        rows: rows.map((row) => [
          row.receiptNo,
          row.collectedAt,
          row.admissionNo,
          row.studentName,
          row.method,
          rupees(row.amountMinor),
        ]),
      };
    },
  },
};

// A cell starting with = + - or @ would run as a formula in a spreadsheet, so it is made plain text.
const cell = (value: Cell) => {
  const text = value === null ? '' : String(value);
  const safe = typeof value === 'string' && /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
};

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const definition = EXPORTS[kind];
  if (!definition) return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  try {
    const ctx = await requirePermission(definition.permission);
    // A teacher sees their own section on screen; a file of it is an office task.
    if (ctx.scope === 'assigned') throw new AppError('FORBIDDEN', 'errors.forbidden');
    const t = await getTranslations('export.columns');

    const lines = [definition.columns.map((column) => cell(t(column))).join(',')];
    let cursor: string | undefined;
    do {
      const page = await definition.page(ctx, cursor);
      for (const row of page.rows) lines.push(row.map(cell).join(','));
      cursor = page.nextCursor ?? undefined;
    } while (cursor && lines.length <= MAX_ROWS);

    await audit(ctx, 'data.export', { type: 'school', id: ctx.schoolId }, { after: { kind, rows: lines.length - 1 } });
    const date = new Date().toISOString().slice(0, 10);
    // The BOM makes Excel read the file as UTF-8, so names and the rupee sign survive.
    return new Response(`﻿${lines.join('\r\n')}\r\n`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${kind}-${date}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof AppError && (error.code === 'UNAUTHENTICATED' || error.code === 'FORBIDDEN')) {
      return Response.json({ error: { code: error.code } }, { status: STATUS[error.code] });
    }
    throw error;
  }
}
