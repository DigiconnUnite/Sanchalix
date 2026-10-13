import { getTranslations } from 'next-intl/server';
import { AppError } from '@/lib/appError';
import { getContext } from '@/server/auth/context';
import { can } from '@/server/auth/permissions';
import { ownStudentIds } from '@/server/modules/portal/own';
import { getReceipt } from '@/server/modules/fees/queries';
import { renderReceiptPdf } from '@/server/modules/fees/receiptPdf';

const STATUS: Partial<Record<string, number>> = { UNAUTHENTICATED: 401, FORBIDDEN: 403 };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getContext();
    if (!ctx) throw new AppError('UNAUTHENTICATED', 'errors.unauthenticated');
    const office = can(ctx.role, 'fees.payment.read');
    if (!office && !can(ctx.role, 'portal.self.read')) throw new AppError('FORBIDDEN', 'errors.forbidden');
    const receipt = await getReceipt(ctx, (await params).id);
    // A parent or student gets only their own receipts; anyone else's is as good as missing.
    const own = office || (receipt && (await ownStudentIds(ctx)).some((id) => String(id) === receipt.studentId));
    if (!receipt || !own) return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
    const [t, tMethod] = await Promise.all([getTranslations('fees.receipt'), getTranslations('fees.counter.methods')]);
    const pdf = await renderReceiptPdf(receipt, String(ctx.schoolId), {
      title: t('pdf.title'),
      receiptNo: t('receiptNo'),
      date: t('date'),
      student: t('student'),
      admissionNo: t('admissionNo'),
      class: t('class'),
      method: t('method'),
      methodName: tMethod.has(receipt.method) ? tMethod(receipt.method as 'cash') : receipt.method,
      reference: t('reference'),
      collectedBy: t('collectedBy'),
      amount: t('amount'),
      allocations: t('allocations'),
      invoiceNo: t('columns.invoiceNo'),
      installment: t('columns.installment'),
      verify: t('pdf.verify'),
      computer: t('pdf.computer'),
    });
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="receipt-${receipt.receiptNo.replaceAll('/', '-')}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof AppError && STATUS[error.code]) {
      return Response.json({ error: { code: error.code } }, { status: STATUS[error.code] ?? 400 });
    }
    throw error;
  }
}
