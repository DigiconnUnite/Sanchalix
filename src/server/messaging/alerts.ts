import 'server-only';
import { todayIn } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import type { RequestContext } from '@/server/auth/context';
import { AttendanceRecord } from '@/server/models/attendanceRecord';
import { Guardian } from '@/server/models/guardian';
import { Invoice } from '@/server/models/invoice';
import { Notification } from '@/server/models/notification';
import { School } from '@/server/models/school';
import { Student } from '@/server/models/student';
import { User } from '@/server/models/user';
import { atTime } from './quietHours';
import { type Outbound, sendMessages } from './send';

type Text<T> = (values: T) => string;

/** Each student's name and the phone of their primary guardian. Students without one are left out. */
async function contacts(ctx: RequestContext, studentIds: unknown[]) {
  const { schoolId } = ctx;
  const students = await Student.find({ schoolId, _id: { $in: studentIds }, status: 'active' })
    .select('firstName lastName primaryGuardianId')
    .lean();
  const guardians = await Guardian.find({ schoolId, _id: { $in: students.map((student) => student.primaryGuardianId) } })
    .select('phone notificationPrefs')
    .lean();
  const guardianOf = new Map(guardians.map((guardian) => [String(guardian._id), guardian]));
  return students.flatMap((student) => {
    const guardian = guardianOf.get(String(student.primaryGuardianId));
    return guardian?.phone
      ? [
          {
            studentId: String(student._id),
            name: `${student.firstName} ${student.lastName ?? ''}`.trim(),
            guardianId: guardian._id,
            phone: guardian.phone,
            feeTextsOff: guardian.notificationPrefs.some(
              (pref) => pref.channel === 'sms' && pref.category === 'fees' && !pref.enabled,
            ),
          },
        ]
      : [];
  });
}

/**
 * Tells the primary guardian of every student marked absent in the section's daily attendance for that date, by
 * SMS and, when the guardian has a portal account, in the app. A guardian hears once per child per day, however many
 * times the sheet is saved.
 */
export async function sendAbsenceAlerts(
  ctx: RequestContext,
  sectionId: string,
  date: string,
  text: Text<{ student: string }>,
) {
  const { schoolId } = ctx;
  const record = await AttendanceRecord.findOne({ schoolId, sectionId, date, mode: 'daily' })
    .select('entries.studentId entries.status')
    .lean();
  const absent = record?.entries.filter((entry) => entry.status === 'absent').map((entry) => entry.studentId) ?? [];
  if (absent.length === 0) return 0;

  const people = await contacts(ctx, absent);
  // Parents are texted at the school's alert time, when the registers are in, and not while teachers are still marking.
  const school = await School.findById(schoolId).select('timezone settings.absenceAlertTime').lean();
  const notBefore = atTime(school?.timezone ?? 'Asia/Kolkata', date, school?.settings?.absenceAlertTime ?? '09:30');
  const accounts = await User.find({
    roles: { $elemMatch: { schoolId } },
    guardianId: { $in: people.map((person) => person.guardianId) },
    status: 'active',
  })
    .select('guardianId')
    .lean();
  await Notification.insertMany(
    accounts.flatMap((account) =>
      people
        .filter((person) => person.guardianId.equals(account.guardianId))
        .map((person) => ({
          schoolId,
          userId: account._id,
          category: 'attendance',
          title: text({ student: person.name }),
          link: '/',
          dedupeKey: `absence:${person.studentId}:${date}:${String(account._id)}`,
        })),
    ),
    { ordered: false },
  ).catch(() => undefined);

  return sendMessages(
    people.map(
      (person): Outbound => ({
        schoolId,
        channel: 'sms',
        to: person.phone,
        template: 'absence',
        urgent: true,
        notBefore,
        recheck: { studentId: person.studentId as never, date },
        body: text({ student: person.name }),
        dedupeKey: `absence:${person.studentId}:${date}`,
      }),
    ),
  );
}

/** One SMS per family with an overdue balance, at most once a day. Returns how many were sent. */
export async function sendDuesReminders(ctx: RequestContext, text: Text<{ student: string; amount: string }>) {
  const { schoolId } = ctx;
  const school = await School.findById(schoolId).select('timezone').lean();
  const today = todayIn(school?.timezone ?? 'Asia/Kolkata');
  const overdue = await Invoice.aggregate<{ _id: unknown; dueMinor: number }>([
    { $match: { schoolId, deletedAt: null, status: { $in: ['issued', 'partially_paid', 'overdue'] }, dueDate: { $lt: today } } },
    { $group: { _id: '$studentId', dueMinor: { $sum: '$balanceMinor' } } },
    { $match: { dueMinor: { $gt: 0 } } },
  ]);
  const dueOf = new Map(overdue.map((row) => [String(row._id), row.dueMinor]));
  // A parent who has switched fee texts off in their profile isn't sent one; they still see what is due in the app.
  const people = (
    await contacts(
      ctx,
      overdue.map((row) => row._id),
    )
  ).filter((person) => !person.feeTextsOff);
  const sent = await sendMessages(
    people.map(
      (person): Outbound => ({
        schoolId,
        channel: 'sms',
        to: person.phone,
        template: 'dues',
        body: text({ student: person.name, amount: formatMoney(dueOf.get(person.studentId) ?? 0) }),
        dedupeKey: `dues:${person.studentId}:${today}`,
      }),
    ),
  );
  return { sent, families: people.length };
}
