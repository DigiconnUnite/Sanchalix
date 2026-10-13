import { randomUUID } from 'node:crypto';
import mongoose, { Types } from 'mongoose';
import { todayIn, weekdayOf } from '@/lib/dates';
import type { RequestContext } from '@/server/auth/context';
import type { RoleKey, Scope } from '@/server/auth/permissions';
import { AttendanceRecord } from '@/server/models/attendanceRecord';
import { Class } from '@/server/models/class';
import { Enrollment } from '@/server/models/enrollment';
import { ExamSchedule, Mark } from '@/server/models/exam';
import { Guardian } from '@/server/models/guardian';
import { Homework } from '@/server/models/homework';
import { Invoice } from '@/server/models/invoice';
import { LeaveRequest } from '@/server/models/leaveRequest';
import { ReportCard } from '@/server/models/reportCard';
import { Section } from '@/server/models/section';
import { Staff } from '@/server/models/staff';
import { StaffAttendance } from '@/server/models/staffAttendance';
import { Student } from '@/server/models/student';
import { TimetableSlot } from '@/server/models/timetableSlot';
import { User } from '@/server/models/user';
import { AdmissionInput } from '@/server/modules/admissions/schemas';
import { acceptAdmission, createAdmission, moveAdmission } from '@/server/modules/admissions/service';
import { addEvent, EventInput } from '@/server/modules/calendar/events';
import { addHoliday } from '@/server/modules/calendar/service';
import { publishAnnouncement } from '@/server/modules/comms/service';
import { generateReportCards, publishReportCards } from '@/server/modules/exams/reportCards';
import { addSchedule, createExam, gradeFor, publishResults, ScheduleInput } from '@/server/modules/exams/service';
import { collectPayment } from '@/server/modules/fees/paymentService';
import { FeeHeadInput, FeeStructureInput } from '@/server/modules/fees/schemas';
import { approveFeeStructure, createFeeHead, createFeeStructure } from '@/server/modules/fees/service';
import { StaffInput } from '@/server/modules/hr/schemas';
import { createStaff } from '@/server/modules/hr/service';
import { createSubject } from '@/server/modules/timetable/service';

const ADDRESS = { line1: '12 School Road', city: 'Bhopal', state: 'Madhya Pradesh', pincode: '462001' };
const DAY_MS = 86_400_000;

// The same "random" data on every run, so screenshots and bug reports match between machines.
const chance = (seed: number) => ((seed * 9301 + 49297) % 233280) / 233280;

const TEACHERS = [
  ['Arvind Kulkarni', 'TGT Science'],
  ['Sneha Iyer', 'TGT English'],
  ['Manoj Tiwari', 'TGT Hindi'],
  ['Farida Sheikh', 'TGT Social Science'],
  ['Deepak Menon', 'Computer teacher'],
  ['Lata Deshmukh', 'TGT Mathematics'],
  ['Rahul Saxena', 'TGT Science'],
  ['Geeta Pillai', 'TGT English'],
  ['Vikram Chauhan', 'TGT Hindi'],
  ['Nandini Bose', 'TGT Social Science'],
  ['Suresh Yadav', 'Computer teacher'],
] as const;
const OFFICE = [
  ['Asha Kumari', 'Librarian', 'librarian'],
  ['Baldev Singh', 'Transport in-charge', 'transport_manager'],
  ['Kamla Devi', 'Office assistant', null],
] as const;
const SUBJECTS = [
  ['Mathematics', 'MATH', 'scholastic'],
  ['Science', 'SCI', 'scholastic'],
  ['English', 'ENG', 'scholastic'],
  ['Hindi', 'HIN', 'scholastic'],
  ['Social Science', 'SST', 'scholastic'],
  ['Computer Science', 'COMP', 'scholastic'],
  ['Art', 'ART', 'co_scholastic'],
  ['Physical Education', 'PE', 'co_scholastic'],
] as const;

export async function seedGreenValleyDemo(schoolId: Types.ObjectId, domain: string, passwordHash: string) {
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes()));
  const today = todayIn('Asia/Kolkata');
  const shift = (days: number) => todayIn('Asia/Kolkata', new Date(Date.now() + days * DAY_MS));

  const accounts = await User.find({ 'roles.schoolId': schoolId }).select('name email roles staffId').lean();
  const ctxOf = (role: RoleKey, scope: Scope = 'school'): RequestContext => {
    const user = accounts.find((account) => account.roles[0]?.role === role);
    if (!user) throw new Error(`The seed has no ${role} account`);
    return { userId: user._id, name: user.name, role, scope, schoolId, ...(user.staffId && { staffId: user.staffId }) };
  };
  const admin = ctxOf('school_admin');
  const principal = ctxOf('principal');
  const accountant = ctxOf('accountant');
  const priya = ctxOf('teacher', 'assigned');
  const email = (name: string) => `${name}@${domain}`;
  const account = (name: string, mail: string, role: RoleKey, scope: Scope, link: Record<string, Types.ObjectId | string>) =>
    User.create({ name, email: email(mail), passwordHash, roles: [{ role, schoolId, scope }], status: 'active', ...link });

  // Staff and their sign-ins.
  const teacherIds = [priya.staffId as Types.ObjectId];
  for (const [index, [name, designation]] of TEACHERS.entries()) {
    const staff = await createStaff(
      admin,
      StaffInput.parse({
        name,
        designation,
        department: 'Academics',
        type: 'teaching',
        phone: `98260${String(10000 + index)}`,
        email: email(`teacher${index + 2}`),
        joinedOn: `20${18 + (index % 6)}-06-15`,
      }),
    );
    teacherIds.push(staff.id);
    const user = await account(name, `teacher${index + 2}`, 'teacher', 'assigned', { staffId: staff.id });
    await Staff.updateOne({ schoolId, _id: staff.id }, { userId: user._id });
  }
  for (const [index, [name, designation, role]] of OFFICE.entries()) {
    const staff = await createStaff(
      admin,
      StaffInput.parse({
        name,
        designation,
        department: 'Administration',
        type: 'non_teaching',
        phone: `98261${String(10000 + index)}`,
        email: '',
        joinedOn: '2020-04-01',
      }),
    );
    if (role) await account(name, role === 'librarian' ? 'librarian' : 'transport', role, 'school', { staffId: staff.id });
  }

  // Sections, class teachers and subjects. The last teacher is left without a class, to test a subject-only teacher.
  const sections = await Section.find({ schoolId }).select('displayName classId branchId academicYearId').lean();
  sections.sort((a, b) => a.displayName.localeCompare(b.displayName, 'en', { numeric: true }));
  for (const [index, section] of sections.entries()) {
    const classTeacherId = teacherIds[index];
    if (classTeacherId) await Section.updateOne({ schoolId, _id: section._id }, { classTeacherId });
  }
  const subjectIds: Types.ObjectId[] = [];
  for (const [name, code, type] of SUBJECTS) subjectIds.push((await createSubject(admin, { name, code, type })).id);
  const scholastic = subjectIds.slice(0, 6);
  const subjectOf = (teacher: number) => scholastic[teacher % scholastic.length] as Types.ObjectId;

  // Timetable: six periods a day. Rotating teachers by section, day and period means no teacher is ever double-booked.
  await TimetableSlot.insertMany(
    sections.flatMap((section, sectionIndex) =>
      [1, 2, 3, 4, 5, 6].flatMap((day) =>
        [1, 2, 3, 4, 5, 6].map((period) => {
          const teacher = (sectionIndex + day + period) % teacherIds.length;
          return {
            schoolId,
            branchId: section.branchId,
            academicYearId: section.academicYearId,
            sectionId: section._id,
            day,
            period,
            subjectId: subjectOf(teacher),
            teacherId: teacherIds[teacher],
            status: 'published',
          };
        }),
      ),
    ),
  );

  // Calendar.
  const holidays = [
    ['2026-10-02', 'Gandhi Jayanti'],
    ['2026-10-20', 'Dussehra'],
    ['2026-11-09', 'Diwali'],
    ['2026-12-25', 'Christmas'],
    ['2027-01-26', 'Republic Day'],
  ] as const;
  for (const [date, name] of holidays) await addHoliday(admin, { date, name });
  for (const [title, type, start, end] of [
    ['Parent-teacher meeting', 'ptm', shift(5), shift(5)],
    ['Half-yearly examinations', 'exam', shift(8), shift(15)],
    ['Annual sports day', 'sports', shift(25), shift(26)],
    ['Science exhibition', 'academic', shift(40), shift(40)],
    ['Annual day', 'cultural', shift(70), shift(70)],
  ] as const) {
    await addEvent(principal, EventInput.parse({ title, type, start, end }));
  }

  // The last working days before today. Today is left untaken so attendance can be tried by hand.
  const closed = new Set<string>(holidays.map(([date]) => date));
  const workingDays: string[] = [];
  for (let back = 1; workingDays.length < 15; back += 1) {
    const date = shift(-back);
    if (weekdayOf(date) !== 0 && !closed.has(date)) workingDays.push(date);
  }

  const enrollments = await Enrollment.find({ schoolId, status: 'active' }).select('studentId sectionId rollNo').lean();
  const rosterOf = (sectionId: Types.ObjectId) =>
    enrollments.filter((enrollment) => enrollment.sectionId.equals(sectionId)).sort((a, b) => a.rollNo - b.rollNo);
  const mark = (seed: number) => {
    const roll = chance(seed);
    return roll < 0.9 ? 'present' : roll < 0.96 ? 'absent' : roll < 0.98 ? 'late' : 'leave';
  };
  const record = (section: (typeof sections)[number], sectionIndex: number, date: string, dayIndex: number, period: number | null) => ({
    schoolId,
    branchId: section.branchId,
    academicYearId: section.academicYearId,
    sectionId: section._id,
    date,
    mode: period ? 'period' : 'daily',
    period,
    ...(period && { subjectId: subjectOf((sectionIndex + weekdayOf(date) + period) % teacherIds.length) }),
    takenBy: teacherIds[sectionIndex] ?? teacherIds[0],
    entries: rosterOf(section._id).map((enrollment) => ({
      studentId: enrollment.studentId,
      status: mark(enrollment.rollNo * 31 + dayIndex * 17 + sectionIndex * 7 + (period ?? 0) * 3),
      source: 'manual',
      at: new Date(`${date}T03:30:00Z`),
    })),
    submittedAt: new Date(`${date}T03:30:00Z`),
    idempotencyKey: randomUUID(),
  });
  await AttendanceRecord.insertMany([
    ...sections.flatMap((section, sectionIndex) =>
      workingDays.map((date, dayIndex) => record(section, sectionIndex, date, dayIndex, null)),
    ),
    // Period attendance for the first two sections, so the register's period view and the per-subject table have data.
    ...sections.slice(0, 2).flatMap((section, sectionIndex) =>
      workingDays.slice(0, 6).flatMap((date, dayIndex) => [1, 2, 3].map((period) => record(section, sectionIndex, date, dayIndex, period))),
    ),
  ]);

  const staff = await Staff.find({ schoolId }).select('branchId').lean();
  await StaffAttendance.insertMany(
    workingDays.slice(0, 10).flatMap((date, dayIndex) =>
      staff.map((member, index) => {
        const roll = chance(index * 13 + dayIndex * 29);
        return {
          schoolId,
          branchId: member.branchId,
          staffId: member._id,
          date,
          status: roll < 0.9 ? 'present' : roll < 0.95 ? 'absent' : roll < 0.98 ? 'half_day' : 'leave',
          source: 'manual',
        };
      }),
    ),
  );
  await LeaveRequest.insertMany(
    [
      { requesterId: teacherIds[0], leaveTypeCode: 'CL', from: shift(6), to: shift(7), reason: 'Family function', status: 'pending' },
      { requesterId: teacherIds[1], leaveTypeCode: 'SL', from: shift(1), to: shift(1), reason: 'Medical appointment', status: 'pending' },
      { requesterId: teacherIds[2], leaveTypeCode: 'CL', from: today, to: today, reason: 'Personal work', status: 'approved' },
      { requesterId: teacherIds[3], leaveTypeCode: 'EL', from: shift(20), to: shift(24), reason: 'Travel', status: 'rejected' },
    ].map((request) => ({
      schoolId,
      requesterType: 'staff',
      ...request,
      approvals:
        request.status === 'pending'
          ? []
          : [{ level: 1, approverId: principal.userId, decision: request.status, comment: request.status === 'rejected' ? 'Exam week' : null, at: new Date() }],
    })),
  );

  // Homework from the teachers who teach each section.
  const taughtBy = (teacher: number) =>
    sections.filter((_, sectionIndex) => [1, 2, 3, 4, 5, 6].some((slot) => (sectionIndex + 1 + slot) % teacherIds.length === teacher));
  await Homework.insertMany(
    [
      [0, 'Fractions worksheet', 'Complete exercise 4.2, questions 1 to 10.', 2],
      [0, 'Geometry practice', 'Draw and label the triangles on page 88.', 5],
      [1, 'Lab record: acids and bases', 'Write up the litmus experiment.', 3],
      [2, 'Essay: My favourite festival', 'About 200 words. Underline the adjectives.', 4],
      [3, 'Hindi grammar', 'Sandhi exercises 1 to 5.', 1],
      [4, 'Map work', 'Mark the major rivers of India on the outline map.', -2],
    ].map(([teacher, title, instructions, due]) => ({
      schoolId,
      sectionIds: taughtBy(teacher as number).slice(0, 2).map((section) => section._id),
      subjectId: subjectOf(teacher as number),
      teacherId: teacherIds[teacher as number],
      title,
      instructions,
      assignedOn: shift(-3),
      dueOn: shift(due as number),
      status: 'published',
    })),
  );

  // Fees: two approved structures with four installments, one draft, and payments from most families.
  const classes = await Class.find({ schoolId }).sort({ order: 1 }).select('order').lean();
  const heads: Types.ObjectId[] = [];
  for (const [name, code] of [['Tuition fee', 'TUITION'], ['Examination fee', 'EXAM'], ['Activity fee', 'ACTIVITY']] as const) {
    heads.push((await createFeeHead(accountant, FeeHeadInput.parse({ name, code, gstRate: '0', discountable: code === 'TUITION' }))).id);
  }
  const installments = [
    { label: 'Quarter 1', dueDate: '2026-04-10', percent: 25 },
    { label: 'Quarter 2', dueDate: '2026-07-10', percent: 25 },
    { label: 'Quarter 3', dueDate: shift(10), percent: 25 },
    { label: 'Quarter 4', dueDate: '2027-01-10', percent: 25 },
  ];
  const structure = (name: string, from: number, to: number, tuition: string) =>
    createFeeStructure(
      accountant,
      FeeStructureInput.parse({
        name,
        classIds: classes.filter(({ order }) => order >= from && order <= to).map(({ _id }) => String(_id)),
        lines: [
          { feeHeadId: String(heads[0]), amountMinor: tuition },
          { feeHeadId: String(heads[1]), amountMinor: '2000' },
          { feeHeadId: String(heads[2]), amountMinor: '1600' },
        ],
        installments,
      }),
    );
  await approveFeeStructure(principal, String((await structure('Classes 6 to 8, 2026–27', 6, 8, '36000')).id));
  await approveFeeStructure(principal, String((await structure('Classes 9 and 10, 2026–27', 9, 10, '44000')).id));
  await createFeeStructure(
    accountant,
    FeeStructureInput.parse({
      name: 'Transport, 2026–27 (draft)',
      classIds: classes.map(({ _id }) => String(_id)),
      lines: [{ feeHeadId: String(heads[2]), amountMinor: '12000' }],
      installments: [{ label: 'Annual', dueDate: shift(30), percent: 100 }],
    }),
  );
  const invoices = await Invoice.find({ schoolId }).sort({ dueDate: 1 }).select('studentId balanceMinor').lean();
  const methods = ['cash', 'upi', 'card', 'bank_transfer'] as const;
  for (const [index, enrollment] of enrollments.entries()) {
    const own = invoices.filter((invoice) => invoice.studentId.equals(enrollment.studentId));
    const [first, second] = own;
    const pattern = index % 10;
    // Six in ten families are paid up to date, two paid one quarter and part of the next, two have paid nothing.
    const allocations =
      !first || !second || pattern >= 8
        ? []
        : pattern < 6
          ? [first, second].map((invoice) => ({ invoiceId: String(invoice._id), amountMinor: invoice.balanceMinor }))
          : [
              { invoiceId: String(first._id), amountMinor: first.balanceMinor },
              { invoiceId: String(second._id), amountMinor: Math.floor(second.balanceMinor / 200) * 100 },
            ];
    if (allocations.length === 0) continue;
    await collectPayment(accountant, {
      studentId: String(enrollment.studentId),
      allocations,
      method: methods[index % methods.length] ?? 'cash',
      ...(index % methods.length !== 0 && { reference: `TXN${String(100000 + index)}` }),
      idempotencyKey: randomUUID(),
    });
  }

  // Admissions at every stage, one of them admitted.
  const firstSection = sections[0];
  const firstClass = classes[0];
  if (!firstSection || !firstClass) throw new Error('The seed created no classes');
  const stages = ['enquiry', 'applied', 'documents_pending', 'assessment', 'offered', 'offered', 'rejected', 'withdrawn'] as const;
  const path = ['applied', 'documents_pending', 'assessment', 'offered'] as const;
  for (const [index, stage] of stages.entries()) {
    const admission = await createAdmission(
      admin,
      AdmissionInput.parse({
        firstName: ['Tara', 'Yash', 'Mira', 'Dev', 'Anika', 'Rudra', 'Sara', 'Neil'][index],
        lastName: ['Kapoor', 'Bhatt', 'Joshi', 'Malhotra', 'Sethi', 'Rana', 'Dutta', 'Gill'][index],
        dob: '2015-06-12',
        gender: index % 2 ? 'male' : 'female',
        classId: String(firstClass._id),
        previousSchool: index % 3 ? 'Sunrise Primary School' : '',
        source: (['walk_in', 'website', 'referral', 'campaign'] as const)[index % 4],
        guardian: { name: `Parent of applicant ${index + 1}`, relation: 'father', phone: `97700${String(10000 + index)}`, email: '' },
      }),
    );
    const id = String(admission.id);
    const reached = stage === 'rejected' || stage === 'withdrawn' ? 1 : (path as readonly string[]).indexOf(stage) + 1;
    for (const to of path.slice(0, reached)) await moveAdmission(admin, { id, to, note: '' });
    if (stage === 'rejected' || stage === 'withdrawn') await moveAdmission(admin, { id, to: stage, note: 'Seat not required' });
    if (index === 5) await acceptAdmission(admin, { id, sectionId: String(firstSection._id), address: ADDRESS });
  }

  // Exams: a finished unit test with published results, and a half-yearly that is open for marks.
  const classIds = classes.map(({ _id }) => String(_id));
  const papers = async (examId: string, firstDay: number, maxMarks: number, passMarks: number) => {
    for (const schoolClass of classes) {
      for (const [index, subjectId] of scholastic.slice(0, 5).entries()) {
        await addSchedule(
          admin,
          ScheduleInput.parse({
            examId,
            classId: String(schoolClass._id),
            subjectId: String(subjectId),
            date: shift(firstDay + index),
            maxMarks,
            passMarks,
          }),
        );
      }
    }
  };
  const unitTest = String((await createExam(admin, { name: 'Unit Test 1', type: 'unit_test', classIds })).id);
  await papers(unitTest, -30, 20, 7);
  const schedules = await ExamSchedule.find({ schoolId, examId: unitTest }).select('classId').lean();
  await Mark.insertMany(
    schedules.flatMap((schedule, paperIndex) =>
      sections
        .filter((section) => section.classId.equals(schedule.classId))
        .flatMap((section) =>
          rosterOf(section._id).map((enrollment) => {
            const roll = chance(enrollment.rollNo * 53 + paperIndex * 11);
            const isAbsent = roll > 0.985;
            const total = isAbsent ? null : Math.round((5 + roll * 15) * 2) / 2;
            return {
              schoolId,
              examScheduleId: schedule._id,
              studentId: enrollment.studentId,
              sectionId: section._id,
              total,
              isAbsent,
              grade: total === null ? null : gradeFor(total, 20),
              enteredBy: priya.userId,
            };
          }),
        ),
    ),
  );
  await ExamSchedule.updateMany(
    { schoolId, examId: unitTest },
    { status: 'locked', lockedBy: principal.userId, lockedAt: new Date() },
  );
  await publishResults(principal, unitTest);
  await papers(String((await createExam(admin, { name: 'Half-yearly examination', type: 'term', classIds })).id), 8, 80, 27);

  // Report cards: 6-A published with remarks, 6-B left as drafts for the class teacher and principal to finish.
  const [sixA, sixB] = sections;
  if (sixA && sixB) {
    await generateReportCards(admin, String(sixA._id));
    await generateReportCards(admin, String(sixB._id));
    await ReportCard.updateMany(
      { schoolId, sectionId: sixA._id },
      { classTeacherRemark: 'Attentive in class. Regular practice will help further.', principalRemark: 'Keep it up.' },
    );
    await publishReportCards(principal, String(sixA._id));
  }

  // Portal: a parent with two children in 6-A, that parent's elder child as a student, and a parent in another class.
  const [childOne, childTwo] = rosterOf(firstSection._id);
  const other = sections[6] && rosterOf(sections[6]._id)[0];
  if (childOne && childTwo && other) {
    const guardian = await Guardian.findOneAndUpdate(
      { schoolId, studentIds: childOne.studentId },
      { $addToSet: { studentIds: childTwo.studentId }, email: email('parent') },
    ).lean();
    const otherGuardian = await Guardian.findOne({ schoolId, studentIds: other.studentId }).lean();
    const student = await Student.findOne({ schoolId, _id: childOne.studentId }).select('firstName lastName').lean();
    if (!guardian || !otherGuardian || !student) throw new Error('The seed found no guardian for the portal accounts');
    await Student.updateOne({ schoolId, _id: childTwo.studentId }, { $addToSet: { guardianIds: guardian._id } });
    await account(guardian.name, 'parent', 'parent', 'ward', { guardianId: guardian._id, phone: guardian.phone });
    await account(otherGuardian.name, 'parent2', 'parent', 'ward', {
      guardianId: otherGuardian._id,
      phone: otherGuardian.phone,
    });
    await account(`${student.firstName} ${student.lastName ?? ''}`.trim(), 'student', 'student', 'self', { studentId: student._id });
  }

  // One person with two roles, to try the role switcher: teacher2 is also the parent of a child in 7-A.
  const ward = sections[2] && rosterOf(sections[2]._id)[0];
  const wardGuardian = ward && (await Guardian.findOne({ schoolId, studentIds: ward.studentId }).lean());
  if (wardGuardian) {
    await User.updateOne(
      { email: email('teacher2') },
      { $push: { roles: { role: 'parent', schoolId, scope: 'ward' } }, guardianId: wardGuardian._id },
    );
  }

  // Announcements last, so every account above gets its notification.
  for (const [title, body, audience] of [
    ['Half-yearly examination schedule', 'The half-yearly examinations begin next week. The date sheet is on the calendar. Students must carry their ID cards.', { type: 'school' }],
    ['Fee reminder: Quarter 3', 'Quarter 3 fees are due soon. Please pay at the school fee counter between 9 am and 1 pm.', { type: 'role', roles: ['parent'] }],
    ['Staff meeting on Saturday', 'All teaching staff are requested to attend the meeting in the conference room at 2 pm.', { type: 'role', roles: ['teacher'] }],
  ] as const) {
    await publishAnnouncement(principal, { title, body, audience: audience as never });
  }

  return {
    staff: staff.length,
    attendanceDays: workingDays.length,
    payments: enrollments.filter((_, index) => index % 10 < 8).length,
  };
}
