import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { RequestContext } from '@/server/auth/context';
import { connectDb } from '@/server/db/connect';
import { LeaveRequest } from '@/server/models/leaveRequest';
import { todayIn, weekdayOf } from '@/lib/dates';
import { School } from '@/server/models/school';
import { Staff } from '@/server/models/staff';
import { StaffAttendance } from '@/server/models/staffAttendance';
import { applyLeave, cancelLeave, decideLeave, getLeaveBalances, LeaveInput, listLeave } from './leave';
import { LeaveQuotasInput, saveLeaveQuotas } from '@/server/modules/settings/service';
import { getStaffSheet, saveStaffAttendance } from './staffAttendance';

const schoolId = new Types.ObjectId();
const person = (role: RequestContext['role'], school = schoolId, staff = true): RequestContext => ({
  userId: new Types.ObjectId(),
  name: 'Test User',
  role,
  scope: role === 'teacher' ? 'assigned' : 'school',
  schoolId: school,
  ...(staff && { staffId: new Types.ObjectId() }),
});
const teacher = person('teacher');
const colleague = person('teacher');
const principal = person('principal');
const otherPrincipal = person('principal', new Types.ObjectId());
const request = (from: string, to = from) =>
  LeaveInput.parse({ leaveTypeCode: 'CL', from, to, halfDay: false, reason: 'Family function' });

beforeAll(async () => {
  await connectDb();
  await Promise.all([LeaveRequest.init(), StaffAttendance.init(), Staff.init()]);
});

afterAll(() => mongoose.disconnect());

it('rejects an end date before the start and a multi-day half day', () => {
  const paths = (input: object) => {
    const result = LeaveInput.safeParse({ leaveTypeCode: 'SL', reason: 'Fever', ...input });
    return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
  };
  expect(paths({ from: '2026-11-10', to: '2026-11-09' })).toEqual(['to']);
  expect(paths({ from: '2026-11-10', to: '2026-11-11', halfDay: true })).toEqual(['halfDay']);
});

it('refuses overlapping requests and people without a staff record', async () => {
  await applyLeave(teacher, request('2026-11-10', '2026-11-12'));
  await expect(applyLeave(teacher, request('2026-11-12', '2026-11-14'))).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
  await expect(applyLeave(person('teacher', schoolId, false), request('2026-11-10'))).rejects.toMatchObject({
    code: 'BUSINESS_RULE',
  });
  await expect(applyLeave(colleague, request('2026-11-10'))).resolves.toBeDefined();
});

it('shows staff only their own requests and approvers the whole school, never another school', async () => {
  const query = { status: 'all' as const };
  expect((await listLeave(teacher, query)).rows).toMatchObject([{ days: 3, isMine: true, status: 'pending' }]);
  expect((await listLeave(principal, query)).rows).toHaveLength(2);
  expect((await listLeave(otherPrincipal, query)).rows).toHaveLength(0);
});

it('decides a request once, never by its own requester or another school', async () => {
  const mine = (await listLeave(teacher, { status: 'all' })).rows[0];
  const id = mine?.id ?? '';
  const approve = { id, decision: 'approved' as const, comment: 'Enjoy' };
  const asApprover = { ...principal, staffId: teacher.staffId } as RequestContext;

  await expect(decideLeave(otherPrincipal, approve)).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
  await expect(decideLeave(asApprover, approve)).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
  await decideLeave(principal, approve);
  await expect(decideLeave(principal, { ...approve, decision: 'rejected' })).rejects.toMatchObject({
    code: 'BUSINESS_RULE',
  });
  expect((await listLeave(teacher, { status: 'approved' })).rows).toMatchObject([{ comment: 'Enjoy' }]);
  await expect(cancelLeave(teacher, id)).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
});

it('lets only the requester cancel a pending request', async () => {
  const theirs = (await listLeave(colleague, { status: 'pending' })).rows[0];
  await expect(cancelLeave(teacher, theirs?.id ?? '')).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
  await cancelLeave(colleague, theirs?.id ?? '');
  expect((await listLeave(principal, { status: 'cancelled' })).rows).toHaveLength(1);
});

it('starts staff on approved leave as on leave, and saves one mark per person per day', async () => {
  const idOf = (person: RequestContext) => person.staffId ?? new Types.ObjectId();
  const member = (staffId: Types.ObjectId, name: string, employeeNo: string) =>
    Staff.create({
      _id: staffId,
      schoolId,
      branchId: new Types.ObjectId(),
      employeeNo,
      name,
      phone: `+9198${employeeNo.slice(-4)}0000`,
      designation: 'TGT',
      type: 'teaching',
      joinedOn: '2024-04-01',
    });
  await member(idOf(teacher), 'Anita Desai', 'EMP-1001');
  await member(idOf(colleague), 'Rohit Kulkarni', 'EMP-1002');
  // The last working day up to today: schools are closed on Sunday by default.
  const today = todayIn('Asia/Kolkata');
  const date = weekdayOf(today) === 0 ? todayIn('Asia/Kolkata', new Date(Date.now() - 86_400_000)) : today;
  await LeaveRequest.create({
    schoolId,
    requesterType: 'staff',
    requesterId: idOf(colleague),
    leaveTypeCode: 'SL',
    from: date,
    to: date,
    reason: 'Fever',
    status: 'approved',
  });

  const sheet = await getStaffSheet(principal, date);
  expect(sheet).toMatchObject({ state: 'open', saved: false });
  expect(sheet.staff).toMatchObject([
    { name: 'Anita Desai', status: 'present', onApprovedLeave: false },
    { name: 'Rohit Kulkarni', status: 'leave', onApprovedLeave: true },
  ]);
  expect((await getStaffSheet(otherPrincipal, date)).staff).toEqual([]);

  const entries = sheet.staff.map(({ id }, index) => ({ staffId: id, status: index === 0 ? ('absent' as const) : ('leave' as const) }));
  await expect(saveStaffAttendance(otherPrincipal, { date, entries })).rejects.toMatchObject({ code: 'VALIDATION' });
  await expect(saveStaffAttendance(principal, { date: '2999-01-01', entries })).rejects.toMatchObject({
    code: 'BUSINESS_RULE',
  });
  expect(await saveStaffAttendance(principal, { date, entries })).toMatchObject({ present: 0, absent: 1, leave: 1 });
  await saveStaffAttendance(principal, { date, entries: [{ staffId: entries[0]?.staffId ?? '', status: 'present' }] });

  expect(await StaffAttendance.countDocuments({ schoolId, date })).toBe(2);
  expect((await getStaffSheet(principal, date)).staff.map(({ status }) => status)).toEqual(['present', 'leave']);
});

it('counts approved and waiting days against the yearly allowance', async () => {
  const fresh = person('teacher');
  expect(await getLeaveBalances(person('teacher', schoolId, false))).toEqual([]);
  await applyLeave(fresh, request('2026-12-01', '2026-12-10'));
  expect((await getLeaveBalances(fresh)).find(({ type }) => type === 'CL')).toEqual({
    type: 'CL',
    quota: 12,
    used: 0,
    pending: 10,
    left: 2,
  });
  await expect(applyLeave(fresh, request('2026-12-15', '2026-12-17'))).rejects.toMatchObject({
    code: 'BUSINESS_RULE',
    details: { left: 2, asked: 3 },
  });
  await expect(applyLeave(fresh, request('2026-12-15', '2026-12-16'))).resolves.toBeDefined();
  // Leave without pay has no allowance to run out of.
  await expect(
    applyLeave(fresh, LeaveInput.parse({ leaveTypeCode: 'LOP', from: '2027-01-05', to: '2027-02-20', reason: 'Long leave' })),
  ).resolves.toBeDefined();
});

it('uses the school’s own allowance when it sets one', async () => {
  const school = await School.create({
    organizationId: new Types.ObjectId(),
    name: 'Quota School',
    code: `Z${Date.now().toString(36).slice(-5).toUpperCase()}`,
    board: 'CBSE',
    address: { line1: '1 Road', city: 'Bhopal', state: 'MP', pincode: '462001', country: 'IN' },
  });
  const own = person('teacher', school._id);
  expect((await getLeaveBalances(own)).map(({ quota }) => quota)).toEqual([12, 10, 15]);
  await saveLeaveQuotas(person('school_admin', school._id), { CL: 3, SL: 4, EL: 5 });
  expect((await getLeaveBalances(own)).map(({ quota }) => quota)).toEqual([3, 4, 5]);
  expect(LeaveQuotasInput.safeParse({ CL: 400, SL: 1, EL: 1 }).success).toBe(false);
  expect(LeaveQuotasInput.safeParse({ CL: '8', SL: 1, EL: 1 }).success).toBe(true);
  await expect(applyLeave(own, request('2026-12-01', '2026-12-05'))).rejects.toMatchObject({ code: 'BUSINESS_RULE', details: { left: 3 } });
});
