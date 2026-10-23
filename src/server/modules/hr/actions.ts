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
import { getTranslations } from 'next-intl/server';
import { ImportStudents as ImportFile } from '@/server/modules/sis/schemas';
import { z } from 'zod';
import { removeDocument, verifyDocument } from '@/server/modules/sis/documents';
import { CheckInInput, checkInStaff } from './checkIn';
import { importStaff as importService } from './importService';
import { StaffInput, StaffUpdate } from './schemas';
import { SaveStaffAttendance, saveStaffAttendance } from './staffAttendance';
import { createStaff as create, updateStaff as update } from './service';

export async function importStaff(input: unknown) {
  return withAction('hr.staff.import', async () => {
    const ctx = await requirePermission('hr.staff.create');
    const { csv, dryRun } = ImportFile.parse(input);
    const [report, t] = await Promise.all([importService(ctx, csv, dryRun), getTranslations()]);
    if (report.imported > 0) {
      await audit(ctx, 'hr.staff.import', { type: 'school', id: ctx.schoolId }, { after: { staff: report.imported } });
    }
    return {
      total: report.total,
      imported: report.imported,
      errorCount: report.errors.length,
      errors: report.errors.slice(0, 100).map(({ row, field, messageKey }) => ({ row, field, message: t(messageKey) })),
    };
  });
}

export async function checkIn(input: unknown) {
  return withAction('hr.attendance.checkIn', async () => {
    const ctx = await requirePermission('hr.checkin.create');
    const arrival = await checkInStaff(ctx, CheckInInput.parse(input));
    if (!arrival.already && ctx.staffId) {
      await audit(ctx, 'hr.attendance.checkIn', { type: 'staff', id: ctx.staffId }, { after: { date: arrival.date } });
    }
    return { at: arrival.at.toISOString(), already: arrival.already };
  });
}

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

const StaffDocumentRef = z.object({
  staffId: z.string().regex(/^[0-9a-f]{24}$/),
  documentId: z.string().regex(/^[0-9a-f]{24}$/),
});

export async function verifyStaffDocument(input: unknown) {
  return withAction('hr.document.verify', async () => {
    const ctx = await requirePermission('hr.staff.update');
    const { staffId, documentId } = StaffDocumentRef.parse(input);
    const document = await verifyDocument(ctx, staffId, documentId, 'staff');
    await audit(ctx, 'hr.document.verify', { type: 'staff', id: document.ownerId }, {
      after: { documentId: String(document.id), type: document.type },
    });
    return { verified: true };
  });
}

export async function deleteStaffDocument(input: unknown) {
  return withAction('hr.document.delete', async () => {
    const ctx = await requirePermission('hr.staff.update');
    const { staffId, documentId } = StaffDocumentRef.parse(input);
    const document = await removeDocument(ctx, staffId, documentId, 'staff');
    await audit(ctx, 'hr.document.delete', { type: 'staff', id: document.ownerId }, {
      before: { documentId: String(document.id), type: document.type, fileName: document.fileName },
    });
    return { deleted: true };
  });
}
