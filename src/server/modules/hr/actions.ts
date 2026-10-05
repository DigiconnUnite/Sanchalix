'use server';

import 'server-only';
import { withAction } from '@/server/action';
import { audit } from '@/server/audit';
import { requirePermission } from '@/server/auth/context';
import {
  applyLeave as apply,
  cancelLeave as cancel,
  decideLeave as decide,
  LeaveDecision,
  LeaveId,
  LeaveInput,
} from './leave';
import { StaffInput, StaffUpdate } from './schemas';
import { SaveStaffAttendance, saveStaffAttendance } from './staffAttendance';
import { createStaff as create, updateStaff as update } from './service';

export async function submitStaffAttendance(input: unknown) {
  return withAction('hr.attendance.update', async () => {
    const ctx = await requirePermission('hr.attendance.update');
    const data = SaveStaffAttendance.parse(input);
    const summary = await saveStaffAttendance(ctx, data);
    await audit(ctx, 'hr.attendance.update', { type: 'school', id: ctx.schoolId }, { after: summary });
    return summary;
  });
}

export async function applyLeave(input: unknown) {
  return withAction('hr.leave.create', async () => {
    const ctx = await requirePermission('hr.leave.create');
    const data = LeaveInput.parse(input);
    const request = await apply(ctx, data);
    await audit(ctx, 'hr.leave.create', { type: 'leaveRequest', id: request.id }, {
      after: { type: data.leaveTypeCode, from: data.from, to: data.to, halfDay: data.halfDay },
    });
    return { status: 'pending' as const };
  });
}

export async function decideLeave(input: unknown) {
  return withAction('hr.leave.approve', async () => {
    const ctx = await requirePermission('hr.leave.approve');
    const data = LeaveDecision.parse(input);
    const request = await decide(ctx, data);
    await audit(ctx, 'hr.leave.approve', { type: 'leaveRequest', id: request.id }, {
      before: { status: 'pending' },
      after: { status: data.decision },
      ...(data.comment && { reason: data.comment }),
    });
    return { decision: data.decision };
  });
}

export async function cancelLeave(input: unknown) {
  return withAction('hr.leave.cancel', async () => {
    const ctx = await requirePermission('hr.leave.create');
    const request = await cancel(ctx, LeaveId.parse(input));
    await audit(ctx, 'hr.leave.cancel', { type: 'leaveRequest', id: request.id }, {
      before: { status: 'pending' },
      after: { status: 'cancelled' },
    });
    return { cancelled: true };
  });
}

export async function updateStaff(input: unknown) {
  return withAction('hr.staff.update', async () => {
    const ctx = await requirePermission('hr.staff.update');
    const data = StaffUpdate.parse(input);
    const staff = await update(ctx, data);
    await audit(ctx, 'hr.staff.update', { type: 'staff', id: staff.id }, {
      before: staff.before,
      after: { designation: data.designation, type: data.type, status: data.status },
    });
    return { name: staff.name };
  });
}

export async function createStaff(input: unknown) {
  return withAction('hr.staff.create', async () => {
    const ctx = await requirePermission('hr.staff.create');
    const data = StaffInput.parse(input);
    const staff = await create(ctx, data);
    await audit(ctx, 'hr.staff.create', { type: 'staff', id: staff.id }, {
      after: { employeeNo: staff.employeeNo, designation: data.designation, type: data.type },
    });
    return { name: staff.name, employeeNo: staff.employeeNo };
  });
}
