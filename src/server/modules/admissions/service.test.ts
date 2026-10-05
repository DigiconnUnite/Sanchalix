import mongoose, { Types } from 'mongoose';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { RequestContext } from '@/server/auth/context';
import { connectDb } from '@/server/db/connect';
import { AcademicYear } from '@/server/models/academicYear';
import { Admission } from '@/server/models/admission';
import { Class } from '@/server/models/class';
import { School } from '@/server/models/school';
import { Section } from '@/server/models/section';
import { Student } from '@/server/models/student';
import { importStudents, parseCsv } from '@/server/modules/sis/importService';
import { AdmissionInput } from './schemas';
import { acceptAdmission, createAdmission, getAdmission, moveAdmission } from './service';

const ADDRESS = { line1: '12 School Road', city: 'Bhopal', state: 'Madhya Pradesh', pincode: '462001' };
let ctx: RequestContext;
let otherSchool: RequestContext;
let classId: string;
let sectionId: string;
let otherClassSectionId: string;

async function seedSchool(code: string) {
  const school = await School.create({
    organizationId: new Types.ObjectId(),
    name: `School ${code}`,
    code,
    board: 'CBSE',
    address: { ...ADDRESS, country: 'IN' },
  });
  const schoolId = school._id;
  const branchId = new Types.ObjectId();
  const year = await AcademicYear.create({
    schoolId,
    label: '2026–27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    status: 'current',
  });
  const common = { schoolId, branchId, academicYearId: year._id };
  const seven = await Class.create({ ...common, name: 'Class 7', order: 7 });
  const eight = await Class.create({ ...common, name: 'Class 8', order: 8 });
  const sevenA = await Section.create({ ...common, classId: seven._id, name: 'A', displayName: '7-A' });
  const eightA = await Section.create({ ...common, classId: eight._id, name: 'A', displayName: '8-A' });
  const context: RequestContext = {
    userId: new Types.ObjectId(),
    name: 'Meena Joshi',
    role: 'school_admin',
    scope: 'school',
    schoolId,
  };
  return { context, classId: String(seven._id), sectionId: String(sevenA._id), otherSectionId: String(eightA._id) };
}

const application = () =>
  AdmissionInput.parse({
    firstName: 'Ishaan',
    lastName: 'Verma',
    dob: '2014-08-20',
    gender: 'male',
    classId,
    source: 'walk_in',
    guardian: { name: 'Pooja Verma', relation: 'mother', phone: '9811122233', email: '' },
  });

beforeAll(async () => {
  await connectDb();
  await Promise.all([Admission, Student, Section, Class, AcademicYear, School].map((model) => model.init()));
  const stamp = Date.now().toString(36).slice(-5).toUpperCase();
  ({ context: ctx, classId, sectionId, otherSectionId: otherClassSectionId } = await seedSchool(`C${stamp}`));
  ({ context: otherSchool } = await seedSchool(`D${stamp}`));
});

afterAll(() => mongoose.disconnect());

it('walks an application through the stages in order and refuses a skipped stage', async () => {
  const created = await createAdmission(ctx, application());
  const id = String(created.id);
  expect(created.applicationNo).toBe('APP-2026-00001');

  await expect(moveAdmission(ctx, { id, to: 'offered', note: '' })).rejects.toMatchObject({ code: 'BUSINESS_RULE' });
  await expect(moveAdmission(otherSchool, { id, to: 'applied', note: '' })).rejects.toMatchObject({
    code: 'BUSINESS_RULE',
  });
  for (const to of ['applied', 'documents_pending', 'assessment', 'offered'] as const) {
    await moveAdmission(ctx, { id, to, note: to === 'offered' ? 'Scored 82%' : '' });
  }
  const detail = await getAdmission(ctx, id);
  expect(detail).toMatchObject({ status: 'offered', classSought: 'Class 7', sections: [{ name: '7-A' }] });
  expect(detail?.history).toHaveLength(5);
  expect(detail?.history[0]).toMatchObject({ from: 'assessment', to: 'offered', note: 'Scored 82%' });
  expect(await getAdmission(otherSchool, id)).toBeNull();
});

it('admits an offered applicant once, into a section of the class sought, or writes nothing', async () => {
  const admission = await Admission.findOne({ schoolId: ctx.schoolId, applicationNo: 'APP-2026-00001' }).lean();
  const id = String(admission?._id);

  await expect(acceptAdmission(ctx, { id, sectionId: otherClassSectionId, address: ADDRESS })).rejects.toMatchObject({
    code: 'NOT_FOUND',
  });
  await expect(acceptAdmission(otherSchool, { id, sectionId, address: ADDRESS })).rejects.toMatchObject({
    code: 'BUSINESS_RULE',
  });
  expect(await Student.countDocuments({ schoolId: ctx.schoolId })).toBe(0);

  const accepted = await acceptAdmission(ctx, { id, sectionId, address: ADDRESS });
  expect(accepted.student.name).toBe('Ishaan Verma');
  expect(await getAdmission(ctx, id)).toMatchObject({ status: 'accepted', studentId: String(accepted.student.id) });
  await expect(acceptAdmission(ctx, { id, sectionId, address: ADDRESS })).rejects.toMatchObject({
    code: 'BUSINESS_RULE',
  });
  expect(await Student.countDocuments({ schoolId: ctx.schoolId })).toBe(1);
});

it('reads quoted CSV cells and imports a file whole or not at all', async () => {
  expect(parseCsv('a,b\r\n"Flat 2, MG Road","say ""hi"""\n')).toEqual([
    ['a', 'b'],
    ['Flat 2, MG Road', 'say "hi"'],
  ]);

  const header = 'firstName,lastName,dob,gender,section,guardianName,relation,phone,email,line1,city,state,pincode';
  const good = 'Anaya,Rao,2014-03-02,female,7-A,Kiran Rao,father,9822211100,,"4, Lake View",Bhopal,Madhya Pradesh,462001';
  const bad = 'Vivaan,Nair,2014-13-40,male,9-Z,Latha Nair,mother,12345,,5 Hill Road,Bhopal,Madhya Pradesh,462001';
  const before = await Student.countDocuments({ schoolId: ctx.schoolId });

  const failed = await importStudents(ctx, [header, good, bad].join('\n'), false);
  expect(failed.imported).toBe(0);
  expect(failed.errors.map(({ row, field }) => `${row}:${field}`)).toEqual(
    expect.arrayContaining(['3:dob', '3:section', '3:phone']),
  );
  expect(await Student.countDocuments({ schoolId: ctx.schoolId })).toBe(before);

  expect(await importStudents(ctx, [header, good].join('\n'), true)).toMatchObject({ total: 1, imported: 0, errors: [] });
  expect(await Student.countDocuments({ schoolId: ctx.schoolId })).toBe(before);
  expect(await importStudents(ctx, [header, good].join('\n'), false)).toMatchObject({ imported: 1 });
  expect(await Student.countDocuments({ schoolId: ctx.schoolId })).toBe(before + 1);
  await expect(importStudents(ctx, 'name,class\nA,B', true)).rejects.toMatchObject({ code: 'VALIDATION' });
});
