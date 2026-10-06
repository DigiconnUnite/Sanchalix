'use server';

import 'server-only';
import { withAction } from '@/server/action';
import { audit } from '@/server/audit';
import { requirePermission } from '@/server/auth/context';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { removeDocument, verifyDocument } from './documents';
import { importStudents as importService } from './importService';
import { ImportStudents, StudentInput, StudentUpdate, TransferStudent, WithdrawStudent } from './schemas';
import {
  createStudent as create,
  transferStudent as transfer,
  updateStudent as update,
  withdrawStudent as withdraw,
} from './service';

const Id = z.string().regex(/^[0-9a-f]{24}$/);
const DocumentRef = z.object({ studentId: Id, documentId: Id });

export async function createStudent(input: unknown) {
  return withAction('sis.student.create', async () => {
    const ctx = await requirePermission('sis.student.create');
    const data = StudentInput.parse(input);
    const student = await create(ctx, data);
    await audit(ctx, 'sis.student.create', { type: 'student', id: student.id }, {
      after: { admissionNo: student.admissionNo, sectionId: data.sectionId },
    });
    return { id: String(student.id), admissionNo: student.admissionNo, name: student.name };
  });
}

export async function importStudents(input: unknown) {
  return withAction('sis.student.import', async () => {
    const ctx = await requirePermission('sis.student.import');
    const { csv, dryRun } = ImportStudents.parse(input);
    const [report, t] = await Promise.all([importService(ctx, csv, dryRun), getTranslations()]);
    if (report.imported > 0) {
      await audit(ctx, 'sis.student.import', { type: 'school', id: ctx.schoolId }, {
        after: { students: report.imported },
      });
    }
    return {
      total: report.total,
      imported: report.imported,
      errorCount: report.errors.length,
      errors: report.errors.slice(0, 100).map(({ row, field, messageKey }) => ({ row, field, message: t(messageKey) })),
    };
  });
}

export async function updateStudent(input: unknown) {
  return withAction('sis.student.update', async () => {
    const ctx = await requirePermission('sis.student.update');
    const data = StudentUpdate.parse(input);
    const student = await update(ctx, data);
    await audit(ctx, 'sis.student.update', { type: 'student', id: student.id }, {
      before: student.before,
      after: { firstName: data.firstName, lastName: data.lastName, dob: data.dob, gender: data.gender },
    });
    return { name: student.name };
  });
}

export async function verifyStudentDocument(input: unknown) {
  return withAction('sis.document.verify', async () => {
    const ctx = await requirePermission('sis.student.update');
    const { studentId, documentId } = DocumentRef.parse(input);
    const document = await verifyDocument(ctx, studentId, documentId);
    await audit(ctx, 'sis.document.verify', { type: 'student', id: document.studentId }, {
      after: { documentId: String(document.id), type: document.type },
    });
    return { verified: true };
  });
}

export async function deleteStudentDocument(input: unknown) {
  return withAction('sis.document.delete', async () => {
    const ctx = await requirePermission('sis.student.update');
    const { studentId, documentId } = DocumentRef.parse(input);
    const document = await removeDocument(ctx, studentId, documentId);
    await audit(ctx, 'sis.document.delete', { type: 'student', id: document.studentId }, {
      before: { documentId: String(document.id), type: document.type, fileName: document.fileName },
    });
    return { deleted: true };
  });
}

export async function transferStudent(input: unknown) {
  return withAction('sis.student.transfer', async () => {
    const ctx = await requirePermission('sis.student.update');
    const { id, sectionId } = TransferStudent.parse(input);
    const student = await transfer(ctx, id, sectionId);
    await audit(ctx, 'sis.student.transfer', { type: 'student', id: student.id }, {
      before: { sectionId: student.from },
      after: { sectionId, rollNo: student.rollNo },
    });
    return { name: student.name, section: student.section, rollNo: student.rollNo };
  });
}

export async function withdrawStudent(input: unknown) {
  return withAction('sis.student.withdraw', async () => {
    const ctx = await requirePermission('sis.student.update');
    const { id, reason } = WithdrawStudent.parse(input);
    const student = await withdraw(ctx, id, reason);
    await audit(ctx, 'sis.student.withdraw', { type: 'student', id: student.id }, {
      before: { status: 'active' },
      after: { status: 'withdrawn', leftOn: student.leftOn },
      reason,
    });
    return { name: student.name };
  });
}
