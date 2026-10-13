import 'server-only';
import type { RequestContext } from '@/server/auth/context';
import { Staff } from '@/server/models/staff';
import { type ImportReport, readImportFile } from '@/server/modules/sis/importService';
import { StaffInput } from './schemas';
import { createStaff } from './service';

export const STAFF_IMPORT_COLUMNS = ['name', 'designation', 'department', 'type', 'phone', 'email', 'joinedOn'] as const;

/**
 * Checks every row first and adds staff only when all of them pass. A mobile number may appear once in the file and
 * must not belong to someone already on the staff record, so the same file can't be imported twice.
 * ponytail: rows are added one after another, not in one transaction, because employee numbers come from a counter
 * outside transactions. Everything is checked beforehand, so a failure part-way would need the database to fail.
 */
export async function importStaff(ctx: RequestContext, csv: string, dryRun: boolean): Promise<ImportReport> {
  const rows = readImportFile(csv, STAFF_IMPORT_COLUMNS);
  const errors: ImportReport['errors'] = [];
  const staff: StaffInput[] = [];
  rows.forEach((value, index) => {
    const parsed = StaffInput.safeParse({ ...value, type: value.type?.toLowerCase().replace(/[\s-]+/g, '_') });
    if (parsed.success) return staff.push(parsed.data);
    for (const issue of parsed.error.issues) errors.push({ row: index + 2, field: issue.path.join('.'), messageKey: issue.message });
  });

  const existing = new Set(
    (await Staff.distinct('phone', { schoolId: ctx.schoolId, phone: { $in: staff.map((member) => member.phone) } })) as string[],
  );
  const seen = new Set<string>();
  rows.forEach((value, index) => {
    const phone = `+91${value.phone}`;
    if (existing.has(phone)) errors.push({ row: index + 2, field: 'phone', messageKey: 'hr.import.errors.phoneTaken' });
    else if (seen.has(phone)) errors.push({ row: index + 2, field: 'phone', messageKey: 'hr.import.errors.phoneRepeated' });
    seen.add(phone);
  });
  if (errors.length > 0 || dryRun) return { total: rows.length, imported: 0, errors: errors.sort((a, b) => a.row - b.row) };

  for (const member of staff) await createStaff(ctx, member);
  return { total: rows.length, imported: staff.length, errors };
}
