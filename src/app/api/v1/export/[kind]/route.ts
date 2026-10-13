import { getTranslations } from 'next-intl/server';
import { AppError } from '@/lib/appError';
import { audit } from '@/server/audit';
import { fileFormat, tableResponse } from '@/server/csv';
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

export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const definition = EXPORTS[kind];
  if (!definition) return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
  try {
    const ctx = await requirePermission(definition.permission);
    // A teacher sees their own section on screen; a file of it is an office task.
    if (ctx.scope === 'assigned') throw new AppError('FORBIDDEN', 'errors.forbidden');
    const t = await getTranslations('export.columns');

    const rows: Cell[][] = [definition.columns.map((column) => t(column))];
    let cursor: string | undefined;
    do {
      const page = await definition.page(ctx, cursor);
      rows.push(...page.rows);
      cursor = page.nextCursor ?? undefined;
    } while (cursor && rows.length <= MAX_ROWS);

    const format = fileFormat(new URL(request.url).searchParams.get('format'));
    await audit(ctx, 'data.export', { type: 'school', id: ctx.schoolId }, { after: { kind, format, rows: rows.length - 1 } });
    return await tableResponse(format, `${kind}-${new Date().toISOString().slice(0, 10)}`, rows);
  } catch (error) {
    if (error instanceof AppError && (error.code === 'UNAUTHENTICATED' || error.code === 'FORBIDDEN')) {
      return Response.json({ error: { code: error.code } }, { status: STATUS[error.code] });
    }
    throw error;
  }
}
