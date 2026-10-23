import 'server-only';
import type { RequestContext } from '@/server/auth/context';
import { Class } from '@/server/models/class';
import { Exam, ExamSchedule, Mark } from '@/server/models/exam';
import { Subject } from '@/server/models/subject';
import { getCurrentYearId } from '@/server/modules/academics/queries';

export type ExamResultsReport = {
  exams: { id: string; name: string; published: boolean }[];
  selected: string | null;
  papers: {
    id: string;
    subject: string;
    className: string;
    appeared: number;
    absent: number;
    passPercent: number | null;
    averagePercent: number | null;
  }[];
};

const percent = (part: number, whole: number) => (whole === 0 ? null : Math.round((part / whole) * 1000) / 10);

/**
 * How each paper of an exam went: who sat it, who was absent, the share who passed and the average. Papers with no
 * marks yet show nothing for the last two rather than zero.
 */
export async function getExamResultsReport(ctx: RequestContext, requested: string | undefined): Promise<ExamResultsReport> {
  const { schoolId } = ctx;
  const academicYearId = await getCurrentYearId(ctx);
  const exams = academicYearId
    ? await Exam.find({ schoolId, academicYearId, status: { $ne: 'draft' } }).sort({ createdAt: -1 }).limit(50).select('name status').lean()
    : [];
  const selected = exams.find((exam) => String(exam._id) === requested) ?? exams[0];
  if (!selected) return { exams: [], selected: null, papers: [] };

  const papers = await ExamSchedule.find({ schoolId, examId: selected._id }).select('classId subjectId maxMarks passMarks').lean();
  const [marks, subjects, classes] = await Promise.all([
    Mark.find({ schoolId, examScheduleId: { $in: papers.map((paper) => paper._id) } }).select('examScheduleId total isAbsent').lean(),
    Subject.find({ schoolId, _id: { $in: papers.map((paper) => paper.subjectId) } }).select('name').lean(),
    Class.find({ schoolId, _id: { $in: papers.map((paper) => paper.classId) } }).select('name order').lean(),
  ]);
  const subjectName = new Map(subjects.map((subject) => [String(subject._id), subject.name]));
  const className = new Map(classes.map((entry) => [String(entry._id), entry.name]));
  const order = new Map(classes.map((entry) => [String(entry._id), entry.order]));

  return {
    exams: exams.map((exam) => ({ id: String(exam._id), name: exam.name, published: exam.status === 'results_published' })),
    selected: String(selected._id),
    papers: papers
      .map((paper) => {
        const own = marks.filter((mark) => mark.examScheduleId.equals(paper._id));
        const sat = own.filter((mark) => !mark.isAbsent && mark.total !== null && mark.total !== undefined);
        const passed = sat.filter((mark) => (mark.total ?? 0) >= paper.passMarks).length;
        const sum = sat.reduce((all, mark) => all + (mark.total ?? 0), 0);
        return {
          at: order.get(String(paper.classId)) ?? 0,
          row: {
            id: String(paper._id),
            subject: subjectName.get(String(paper.subjectId)) ?? '',
            className: className.get(String(paper.classId)) ?? '',
            appeared: sat.length,
            absent: own.filter((mark) => mark.isAbsent).length,
            passPercent: percent(passed, sat.length),
            averagePercent: percent(sum, sat.length * paper.maxMarks),
          },
        };
      })
      .sort((a, b) => a.at - b.at || a.row.subject.localeCompare(b.row.subject))
      .map(({ row }) => row),
  };
}
