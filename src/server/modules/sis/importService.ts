import 'server-only';
import { AppError } from '@/lib/appError';
import type { RequestContext } from '@/server/auth/context';
import { withTransaction } from '@/server/db/transaction';
import { listCurrentSections } from '@/server/modules/academics/queries';
import { StudentInput } from './schemas';
import { createStudent } from './service';

export const IMPORT_COLUMNS = [
  'firstName',
  'lastName',
  'dob',
  'gender',
  'section',
  'guardianName',
  'relation',
  'phone',
  'email',
  'line1',
  'city',
  'state',
  'pincode',
] as const;
const MAX_ROWS = 500;
const FIELD_OF: Record<string, string> = {
  sectionId: 'section',
  'guardians.0.name': 'guardianName',
  'guardians.0.relation': 'relation',
  'guardians.0.phone': 'phone',
  'guardians.0.email': 'email',
};

/** RFC 4180 CSV: quoted cells may hold commas, line breaks and doubled quotes. */
export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const source = text.replace(/^﻿/, '');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      rows.push([...row, cell]);
      row = [];
      cell = '';
    } else cell += char;
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows.filter((cells) => cells.some((value) => value.trim()));
}

export type ImportReport = {
  total: number;
  imported: number;
  errors: { row: number; field: string; messageKey: string }[];
};

/**
 * Checks every row first and writes only when all of them pass, in one transaction, so a file is imported whole or
 * not at all. A dry run stops after the check.
 */
export async function importStudents(ctx: RequestContext, csv: string, dryRun: boolean): Promise<ImportReport> {
  const [header, ...lines] = parseCsv(csv);
  if (!header || IMPORT_COLUMNS.some((column, index) => header[index]?.trim() !== column)) {
    throw new AppError('VALIDATION', 'sis.import.errors.header');
  }
  if (lines.length === 0) throw new AppError('VALIDATION', 'sis.import.errors.empty');
  // ponytail: imported in the request, so the file is capped. Move to importJobs and the worker for bigger files.
  if (lines.length > MAX_ROWS) throw new AppError('VALIDATION', 'sis.import.errors.tooMany', { max: MAX_ROWS });

  const sections = await listCurrentSections(ctx);
  const sectionId = new Map(sections.map((section) => [section.name.toLowerCase(), section.id]));
  const errors: ImportReport['errors'] = [];
  const students: StudentInput[] = [];
  lines.forEach((cells, index) => {
    const value = Object.fromEntries(IMPORT_COLUMNS.map((column, at) => [column, (cells[at] ?? '').trim()]));
    const parsed = StudentInput.safeParse({
      firstName: value.firstName,
      lastName: value.lastName,
      dob: value.dob,
      gender: value.gender?.toLowerCase(),
      sectionId: sectionId.get(value.section?.toLowerCase() ?? '') ?? '',
      guardians: [
        { name: value.guardianName, relation: value.relation?.toLowerCase(), phone: value.phone, email: value.email },
      ],
      address: { line1: value.line1, city: value.city, state: value.state, pincode: value.pincode },
    });
    if (parsed.success) return students.push(parsed.data);
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.');
      // Row 1 is the header, so the first student is on row 2, as a spreadsheet shows it.
      errors.push({ row: index + 2, field: FIELD_OF[path] ?? path.replace('address.', ''), messageKey: issue.message });
    }
  });
  if (errors.length > 0 || dryRun) return { total: lines.length, imported: 0, errors };

  await withTransaction(async (session) => {
    for (const student of students) await createStudent(ctx, student, session);
  });
  return { total: lines.length, imported: students.length, errors };
}
