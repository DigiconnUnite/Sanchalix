import { Types } from 'mongoose';
import { getTranslations } from 'next-intl/server';
import { AppError } from '@/lib/appError';
import { audit } from '@/server/audit';
import { requirePermission } from '@/server/auth/context';
import { renderCertificatePdf } from '@/server/modules/sis/certificatePdf';
import { getTransferCertificate } from '@/server/modules/sis/queries';

const STATUS: Partial<Record<string, number>> = { UNAUTHENTICATED: 401, FORBIDDEN: 403 };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requirePermission('sis.certificate.create');
    const certificate = await getTransferCertificate(ctx, (await params).id);
    if (!certificate) return Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 });
    const [t, tGender] = await Promise.all([getTranslations('sis.students.certificate'), getTranslations('sis.students.gender')]);
    const pdf = await renderCertificatePdf(certificate, String(ctx.schoolId), {
      title: t('title'),
      tcNo: t('tcNo'),
      issuedOn: t('issuedOn'),
      affiliationNo: t('affiliationNo'),
      name: t('name'),
      admissionNo: t('admissionNo'),
      guardians: t('guardians'),
      dob: t('dob'),
      gender: t('gender'),
      genderName: tGender(certificate.gender),
      class: t('class'),
      academicYear: t('academicYear'),
      leftOn: t('leftOn'),
      dues: t('dues'),
      duesName: t(certificate.duesCleared ? 'duesCleared' : 'duesPending'),
      reason: t('reason'),
      preparedBy: t('preparedBy'),
      classTeacher: t('classTeacher'),
      principal: t('principal'),
      verify: t('pdfVerify'),
    });
    await audit(ctx, 'sis.certificate.download', { type: 'student', id: new Types.ObjectId(certificate.studentId) }, {
      after: { tcNo: certificate.tcNo },
    });
    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="tc-${certificate.tcNo.replaceAll('/', '-')}.pdf"`,
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
