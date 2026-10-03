import 'server-only';
import type { Types } from 'mongoose';
import { School } from '@/server/models/school';

export async function getSchoolName(schoolId: Types.ObjectId) {
  const school = await School.findById(schoolId).select('name').lean();
  return school?.name ?? '';
}
