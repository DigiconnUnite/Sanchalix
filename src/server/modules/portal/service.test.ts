import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { RequestContext } from '@/server/auth/context';
import { connectDb } from '@/server/db/connect';
import { AcademicYear } from '@/server/models/academicYear';
import { School } from '@/server/models/school';
import { Section } from '@/server/models/section';
import { Student } from '@/server/models/student';
import { User } from '@/server/models/user';
import { StudentInput } from '@/server/modules/sis/schemas';
import { createStudent } from '@/server/modules/sis/service';
import { createPortalAccount, getPortalHome, listPortalAccounts } from './service';

const ADDRESS = { line1: '12 School Road', city: 'Bhopal', state: 'Madhya Pradesh', pincode: '462001' };
const stamp = Date.now();
let admin: RequestContext;
let otherSchool: RequestContext;
let sectionId: string;
const ids: string[] = [];

async function seedSchool(code: string) {
  const school = await School.create({
    organizationId: new Types.ObjectId(),
    name: code,
    code,
    board: 'CBSE',
    address: { ...ADDRESS, country: 'IN' },
  });
  const year = await AcademicYear.create({
    schoolId: school._id,
    label: '2026–27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    status: 'current',
  });
  const section = await Section.create({
    schoolId: school._id,
    branchId: new Types.ObjectId(),
    academicYearId: year._id,
    classId: new Types.ObjectId(),
    name: 'A',
    displayName: '5-A',
  });
  const context: RequestContext = {
    userId: new Types.ObjectId(),
    name: 'Office',
    role: 'school_admin',
    scope: 'school',
    schoolId: school._id,
  };
  return { context, sectionId: String(section._id) };
}

const add = async (firstName: string, phone: string) =>
  String(
    (
      await createStudent(
        admin,
        StudentInput.parse({
          firstName,
          lastName: 'Iyer',
          dob: '2015-02-01',
          gender: 'male',
          sectionId,
          guardians: [{ name: `Parent ${phone}`, relation: 'father', phone, email: '' }],
          address: ADDRESS,
        }),
      )
    ).id,
  );

beforeAll(async () => {
  await connectDb();
  await Promise.all([Student, Section, AcademicYear, School, User].map((model) => model.init()));
  const code = stamp.toString(36).slice(-5).toUpperCase();
  ({ context: admin, sectionId } = await seedSchool(`J${code}`));
  ({ context: otherSchool } = await seedSchool(`K${code}`));
  ids.push(await add('Arjun', '9700000001'), await add('Kiran', '9700000001'), await add('Neel', '9700000002'));
});

afterAll(() => mongoose.disconnect());

it('gives a parent every child linked to them and nobody else’s', async () => {
  const [arjun = '', kiran = '', neel = ''] = ids;
  const rows = await listPortalAccounts(admin, arjun);
  expect(rows).toMatchObject([
    { guardianId: null, name: 'Arjun Iyer', accountEmail: null },
    { name: 'Parent 9700000001', accountEmail: null },
  ]);
  const guardianId = rows[1]?.guardianId ?? '';
  const email = `parent.${stamp}@example.com`;

  await expect(createPortalAccount(otherSchool, { studentId: arjun, guardianId, email })).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  const parentAccount = await createPortalAccount(admin, { studentId: arjun, guardianId, email });
  await expect(
    createPortalAccount(admin, { studentId: kiran, guardianId, email: `again.${stamp}@example.com` }),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  const studentAccount = await createPortalAccount(admin, { studentId: neel, email: `neel.${stamp}@example.com` });
  expect((await listPortalAccounts(admin, kiran))[1]).toMatchObject({ accountEmail: email });

  const signedIn = async (userId: Types.ObjectId): Promise<RequestContext> => {
    const user = await User.findById(userId).orFail().lean();
    const assignment = user.roles[0];
    return {
      userId,
      name: user.name,
      role: assignment?.role ?? 'parent',
      scope: assignment?.scope ?? 'ward',
      schoolId: admin.schoolId,
      ...(user.studentId && { studentId: user.studentId }),
      ...(user.guardianId && { guardianId: user.guardianId }),
    };
  };
  const parent = await signedIn(parentAccount.id);
  expect(parent).toMatchObject({ role: 'parent', scope: 'ward' });
  const home = await getPortalHome(parent);
  expect(home?.children.map(({ name }) => name)).toEqual(['Arjun Iyer', 'Kiran Iyer']);
  expect(home?.selected).toMatchObject({ name: 'Arjun Iyer', classSection: '5-A' });
  expect((await getPortalHome(parent, kiran))?.selected.name).toBe('Kiran Iyer');
  expect((await getPortalHome(parent, neel))?.selected.name).toBe('Arjun Iyer');

  const student = await signedIn(studentAccount.id);
  expect((await getPortalHome(student, arjun))?.selected.name).toBe('Neel Iyer');
  expect(await getPortalHome({ ...parent, schoolId: otherSchool.schoolId })).toBeNull();
  expect(await getPortalHome(admin)).toBeNull();
});
