import 'server-only';
import type { Types } from 'mongoose';
import { School } from '@/server/models/school';

export async function getSchoolBrand(schoolId: Types.ObjectId) {
  const school = await School.findById(schoolId).select('name logoUrl').lean();
  return { name: school?.name ?? '', logoUrl: school?.logoUrl || null };
}
