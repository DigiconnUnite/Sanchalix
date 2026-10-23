import 'server-only';
import { z } from 'zod';
import { AppError } from '@/lib/appError';
import type { RequestContext } from '@/server/auth/context';
import { can } from '@/server/auth/permissions';
import { paginate } from '@/server/db/paginate';
import { AcademicYear } from '@/server/models/academicYear';
import { LEAVE_STATUSES, LEAVE_TYPES, LeaveRequest } from '@/server/models/leaveRequest';
import { School } from '@/server/models/school';
import { Staff } from '@/server/models/staff';

const E = 'hr.leave.errors';
const Day = (key: string) =>
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${E}.${key}`)
    .refine((date) => !Number.isNaN(Date.parse(date)), `${E}.${key}`);

export const LeaveInput = z
  .object({
    leaveTypeCode: z.enum(LEAVE_TYPES, `${E}.type`),
    from: Day('from'),
    to: Day('to'),
    halfDay: z.boolean().default(false),
    reason: z.string().trim().min(1, `${E}.reason`).max(300, `${E}.reason`),
  })
  .refine(({ from, to }) => to >= from, { path: ['to'], message: `${E}.toBeforeFrom` })
  .refine(({ from, to, halfDay }) => !halfDay || from === to, { path: ['halfDay'], message: `${E}.halfDay` });
export type LeaveInput = z.infer<typeof LeaveInput>;

const Id = z.string().regex(/^[0-9a-f]{24}$/, `${E}.notFound`);
export const LeaveId = Id;
export const LeaveDecision = z.object({
  id: Id,
  decision: z.enum(['approved', 'rejected']),
  comment: z.string().trim().max(300, `${E}.comment`).default(''),
});
export type LeaveDecision = z.infer<typeof LeaveDecision>;

export const ListLeave = z.object({
  status: z.enum(['all', ...LEAVE_STATUSES]).catch('all'),
  cursor: z.string().optional().catch(undefined),
});
export type ListLeave = z.infer<typeof ListLeave>;

export type LeaveRow = {
  id: string;
  staffName: string;
  type: (typeof LEAVE_TYPES)[number];
  from: string;
  to: string;
  halfDay: boolean;
  days: number;
  reason: string;
  status: (typeof LEAVE_STATUSES)[number];
  comment: string | null;
  isMine: boolean;
};

export const PAID_LEAVE = ['CL', 'SL', 'EL'] as const;
export const DEFAULT_LEAVE_QUOTAS: Record<(typeof PAID_LEAVE)[number], number> = { CL: 12, SL: 10, EL: 15 };

export type LeaveBalance = { type: (typeof LEAVE_TYPES)[number]; quota: number; used: number; pending: number; left: number };

/** Days taken and still waiting for a decision in the current academic year, against each leave type's allowance. */
export async function getLeaveBalances(ctx: RequestContext): Promise<LeaveBalance[]> {
  if (!ctx.staffId) return [];
  const year = await AcademicYear.findOne({ schoolId: ctx.schoolId, status: 'current' }).select('startDate endDate').lean();
  const requests = await LeaveRequest.find({
    schoolId: ctx.schoolId,
    requesterId: ctx.staffId,
    status: { $in: ['pending', 'approved'] },
    ...(year && { from: { $gte: year.startDate, $lte: year.endDate } }),
  })
    .select('leaveTypeCode from to halfDay status')
    .lean();
  const school = await School.findById(ctx.schoolId).select('settings.leaveQuotas').lean();
  const quotas = { ...DEFAULT_LEAVE_QUOTAS, ...school?.settings?.leaveQuotas };
  return PAID_LEAVE.map((type) => {
    const quota = quotas[type];
    const days = (status: string) =>
      requests
        .filter((request) => request.leaveTypeCode === type && request.status === status)
        .reduce((sum, request) => sum + (request.halfDay ? 0.5 : daysBetween(request.from, request.to)), 0);
    const [used, pending] = [days('approved'), days('pending')];
    return { type: type as LeaveBalance['type'], quota, used, pending, left: quota - used - pending };
  });
}

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;

export async function applyLeave(ctx: RequestContext, input: LeaveInput) {
  const { schoolId } = ctx;
  if (!ctx.staffId) throw new AppError('BUSINESS_RULE', `${E}.notStaff`);
  const overlapping = await LeaveRequest.exists({
    schoolId,
    requesterId: ctx.staffId,
    status: { $in: ['pending', 'approved'] },
    from: { $lte: input.to },
    to: { $gte: input.from },
  });
  if (overlapping) throw new AppError('BUSINESS_RULE', `${E}.overlap`);
  // Requests still waiting count against the balance too, so two pending requests can't both use the last days.
  const balance = (await getLeaveBalances(ctx)).find(({ type }) => type === input.leaveTypeCode);
  const asked = input.halfDay ? 0.5 : daysBetween(input.from, input.to);
  if (balance && asked > balance.left) {
    throw new AppError('BUSINESS_RULE', `${E}.insufficient`, { left: Math.max(balance.left, 0), asked });
  }
  const request = await LeaveRequest.create({
    schoolId,
    requesterType: 'staff',
    requesterId: ctx.staffId,
    ...input,
    createdBy: ctx.userId,
    updatedBy: ctx.userId,
  });
  return { id: request._id };
}

/** Approvers see every staff request of the school; everyone else sees only their own. */
export async function listLeave(ctx: RequestContext, query: ListLeave) {
  const { schoolId } = ctx;
  const approver = can(ctx.role, 'hr.leave.approve');
  const { rows, ...page } = await paginate(
    LeaveRequest,
    {
      schoolId,
      requesterType: 'staff' as const,
      ...(!approver && { requesterId: ctx.staffId ?? null }),
      ...(query.status !== 'all' && { status: query.status }),
    },
    {
      sortField: 'from',
      select: ['requesterId', 'leaveTypeCode', 'from', 'to', 'halfDay', 'reason', 'status', 'approvals'],
      limit: 25,
      cursor: query.cursor,
      descending: true,
    },
  );
  const staff = await Staff.find({ schoolId, _id: { $in: rows.map((row) => row.requesterId) } })
    .setOptions({ withDeleted: true })
    .select('name')
    .lean();
  const nameOf = new Map(staff.map((member) => [String(member._id), member.name]));
  const leave: LeaveRow[] = rows.map((row) => ({
    id: String(row._id),
    staffName: nameOf.get(String(row.requesterId)) ?? '',
    type: row.leaveTypeCode,
    from: row.from,
    to: row.to,
    halfDay: row.halfDay,
    days: row.halfDay ? 0.5 : daysBetween(row.from, row.to),
    reason: row.reason,
    status: row.status,
    comment: row.approvals.at(-1)?.comment || null,
    isMine: Boolean(ctx.staffId) && String(row.requesterId) === String(ctx.staffId),
  }));
  return { rows: leave, ...page };
}

export async function decideLeave(ctx: RequestContext, { id, decision, comment }: LeaveDecision) {
  // Nobody approves their own leave, and a request is decided once: both are part of the filter.
  const request = await LeaveRequest.findOneAndUpdate(
    { schoolId: ctx.schoolId, _id: id, status: 'pending', requesterId: { $ne: ctx.staffId ?? null } },
    {
      status: decision,
      updatedBy: ctx.userId,
      $push: { approvals: { level: 1, approverId: ctx.userId, decision, comment: comment || null, at: new Date() } },
    },
  )
    .select('requesterId from to')
    .lean();
  if (!request) throw new AppError('BUSINESS_RULE', `${E}.cannotDecide`);
  return { id: request._id, from: request.from, to: request.to };
}

export async function cancelLeave(ctx: RequestContext, id: string) {
  if (!ctx.staffId) throw new AppError('NOT_FOUND', `${E}.notFound`);
  const request = await LeaveRequest.findOneAndUpdate(
    { schoolId: ctx.schoolId, _id: id, requesterId: ctx.staffId, status: 'pending' },
    { status: 'cancelled', updatedBy: ctx.userId },
  )
    .select('_id')
    .lean();
  if (!request) throw new AppError('BUSINESS_RULE', `${E}.cannotCancel`);
  return { id: request._id };
}
