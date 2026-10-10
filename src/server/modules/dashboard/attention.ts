import 'server-only';
import type { RequestContext } from '@/server/auth/context';
import { can, type Permission } from '@/server/auth/permissions';
import { Admission } from '@/server/models/admission';
import { ExamSchedule } from '@/server/models/exam';
import { LeaveRequest } from '@/server/models/leaveRequest';
import { ReportCard } from '@/server/models/reportCard';
import { getSchoolCalendar } from '@/server/modules/attendance/queries';

export type AttentionItem = { key: 'leave' | 'admissions' | 'marks' | 'reportCards'; count: number; href: string };

/** Work waiting on this person. An item appears only if the role can act on it and there is something to do. */
export async function getAttention(ctx: RequestContext): Promise<AttentionItem[]> {
  const { schoolId } = ctx;
  const { today } = await getSchoolCalendar(ctx);
  const count = (permission: Permission, run: () => Promise<number>) => (can(ctx.role, permission) ? run() : 0);

  const [leave, admissions, marks, reportCards] = await Promise.all([
    count('hr.leave.approve', () => LeaveRequest.countDocuments({ schoolId, requesterType: 'staff', status: 'pending' })),
    count('sis.admission.update', () => Admission.countDocuments({ schoolId, status: 'offered' })),
    // Results can't go out until every paper is locked, so a paper left open after its date holds the exam up.
    count('exams.mark.approve', () =>
      ExamSchedule.countDocuments({ schoolId, status: { $ne: 'locked' }, date: { $lt: today } }),
    ),
    count('exams.reportCard.publish', () => ReportCard.countDocuments({ schoolId, status: 'draft' })),
  ]);

  const items: AttentionItem[] = [
    { key: 'leave', count: leave, href: '/leave?status=pending' },
    { key: 'admissions', count: admissions, href: '/admissions?status=offered' },
    { key: 'marks', count: marks, href: '/exams' },
    { key: 'reportCards', count: reportCards, href: '/report-cards' },
  ];
  return items.filter((item) => item.count > 0);
}
