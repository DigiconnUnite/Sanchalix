import 'server-only';
import { z } from 'zod';
import { ADMISSION_SOURCES, ADMISSION_STATUSES } from '@/server/models/admission';
import type { DocumentRow } from '@/server/modules/sis/documents';
import { StudentInput } from '@/server/modules/sis/schemas';

const E = 'admissions.errors';
const Id = (key: string) => z.string().regex(/^[0-9a-f]{24}$/, `${E}.${key}`);

export type AdmissionStatus = (typeof ADMISSION_STATUSES)[number];
export const FINAL: AdmissionStatus[] = ['accepted', 'rejected', 'withdrawn'];

/** Where an application may go from each stage. Acceptance is separate because it also creates the student. */
export const NEXT: Record<AdmissionStatus, AdmissionStatus[]> = {
  enquiry: ['applied', 'rejected', 'withdrawn'],
  applied: ['documents_pending', 'rejected', 'withdrawn'],
  documents_pending: ['assessment', 'rejected', 'withdrawn'],
  assessment: ['offered', 'documents_pending', 'rejected', 'withdrawn'],
  offered: ['rejected', 'withdrawn'],
  accepted: [],
  rejected: [],
  withdrawn: [],
};

export const AdmissionInput = StudentInput.pick({ firstName: true, lastName: true, dob: true, gender: true }).extend({
  classId: Id('class'),
  previousSchool: z.string().trim().max(120, `${E}.previousSchool`).default(''),
  source: z.enum(ADMISSION_SOURCES, `${E}.source`),
  guardian: StudentInput.shape.guardians.element,
});
export type AdmissionInput = z.infer<typeof AdmissionInput>;

export const MoveAdmission = z.object({
  id: Id('notFound'),
  to: z.enum(ADMISSION_STATUSES).exclude(['enquiry', 'accepted']),
  note: z.string().trim().max(300, `${E}.note`).default(''),
});
export type MoveAdmission = z.infer<typeof MoveAdmission>;

export const AcceptAdmission = z.object({
  id: Id('notFound'),
  sectionId: Id('section'),
  address: StudentInput.shape.address,
});
export type AcceptAdmission = z.infer<typeof AcceptAdmission>;

export const ListAdmissions = z.object({
  status: z.enum(['open', ...ADMISSION_STATUSES]).catch('open'),
  cursor: z.string().optional().catch(undefined),
});
export type ListAdmissions = z.infer<typeof ListAdmissions>;

// ponytail: one list for every school and class; move it to school settings when a school needs its own.
export const REQUIRED_DOCUMENTS = ['birth_certificate', 'photo'];
export const AdmissionDocument = z.object({ admissionId: Id('notFound'), documentId: Id('notFound') });

export type AdmissionRow = {
  id: string;
  applicationNo: string;
  name: string;
  classSought: string;
  guardianName: string;
  guardianPhone: string;
  status: AdmissionStatus;
  appliedOn: string;
};

export type AdmissionDetail = AdmissionRow & {
  dob: string;
  gender: string;
  previousSchool: string | null;
  source: string;
  guardianRelation: string;
  guardianEmail: string | null;
  studentId: string | null;
  next: AdmissionStatus[];
  sections: { id: string; name: string }[];
  documents: DocumentRow[];
  /** Required document types with no verified file yet. The applicant can't be admitted until this is empty. */
  missingDocuments: string[];
  history: { at: string; from: string | null; to: string; note: string | null }[];
};
