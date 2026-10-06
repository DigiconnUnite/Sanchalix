import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { StudentProfileView } from '@/features/sis/StudentProfileView';
import { can } from '@/server/auth/permissions';
import { listCurrentSections } from '@/server/modules/academics/queries';
import { getStudentResults } from '@/server/modules/exams/service';
import { listPortalAccounts } from '@/server/modules/portal/service';
import { listDocuments } from '@/server/modules/sis/documents';
import { getStudent, getStudentAttendance, getStudentFees, listStudentHistory } from '@/server/modules/sis/queries';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('sis.students');
  return { title: t('title') };
}

export default async function StudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await pageContext('sis.student.read');
  const [{ id }, { tab, notice }] = await Promise.all([params, searchParams]);
  const student = await getStudent(ctx, id);
  if (!student) notFound();
  const canEdit = can(ctx.role, 'sis.student.update');
  const [documents, results, accounts, sections, attendance, fees, history] = await Promise.all([
    can(ctx.role, 'sis.document.read') ? listDocuments(ctx, id) : null,
    can(ctx.role, 'exams.exam.read') ? getStudentResults(ctx, id, false) : null,
    can(ctx.role, 'users.user.create') ? listPortalAccounts(ctx, id) : null,
    canEdit && student.status === 'active' ? listCurrentSections(ctx) : [],
    can(ctx.role, 'attendance.record.read') ? getStudentAttendance(ctx, id) : null,
    can(ctx.role, 'fees.invoice.read') ? getStudentFees(ctx, id) : null,
    can(ctx.role, 'audit.log.read') ? listStudentHistory(ctx, id) : null,
  ]);

  return (
    <StudentProfileView
      student={student}
      attendance={attendance}
      fees={fees}
      history={history}
      results={results}
      documents={documents}
      accounts={accounts}
      tab={typeof tab === 'string' ? tab : 'overview'}
      notice={
        notice === 'added' || notice === 'updated' || notice === 'withdrawn' || notice === 'transferred' ? notice : null
      }
      canEdit={canEdit}
      sections={sections.filter((section) => section.name !== student.classSection)}
    />
  );
}
