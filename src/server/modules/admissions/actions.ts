'use server';

import 'server-only';
import { withAction } from '@/server/action';
import { audit } from '@/server/audit';
import { requirePermission } from '@/server/auth/context';
import { AcceptAdmission, AdmissionInput, MoveAdmission } from './schemas';
import { acceptAdmission as accept, createAdmission as create, moveAdmission as move } from './service';

export async function createAdmission(input: unknown) {
  return withAction('sis.admission.create', async () => {
    const ctx = await requirePermission('sis.admission.update');
    const data = AdmissionInput.parse(input);
    const admission = await create(ctx, data);
    await audit(ctx, 'sis.admission.create', { type: 'admission', id: admission.id }, {
      after: { applicationNo: admission.applicationNo, classId: data.classId, source: data.source },
    });
    return { id: String(admission.id), applicationNo: admission.applicationNo, name: admission.name };
  });
}

export async function moveAdmission(input: unknown) {
  return withAction('sis.admission.update', async () => {
    const ctx = await requirePermission('sis.admission.update');
    const data = MoveAdmission.parse(input);
    const admission = await move(ctx, data);
    await audit(ctx, 'sis.admission.update', { type: 'admission', id: admission.id }, {
      before: { status: admission.from },
      after: { status: data.to },
      ...(data.note && { reason: data.note }),
    });
    return { applicationNo: admission.applicationNo };
  });
}

export async function acceptAdmission(input: unknown) {
  return withAction('sis.admission.accept', async () => {
    const ctx = await requirePermission('sis.admission.update');
    const data = AcceptAdmission.parse(input);
    const admission = await accept(ctx, data);
    await audit(ctx, 'sis.admission.accept', { type: 'admission', id: admission.id }, {
      before: { status: 'offered' },
      after: { status: 'accepted', admissionNo: admission.student.admissionNo },
    });
    await audit(ctx, 'sis.student.create', { type: 'student', id: admission.student.id }, {
      after: { admissionNo: admission.student.admissionNo, sectionId: data.sectionId },
    });
    return { studentId: String(admission.student.id), name: admission.student.name };
  });
}
