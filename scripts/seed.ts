import mongoose, { Types } from 'mongoose';
import { TOTP_REQUIRED_ROLES } from '@/server/auth/permissions';
import { seal } from '@/server/auth/secretBox';
import { hashPassword } from '@/server/auth/service';
import { connectDb } from '@/server/db/connect';
import { AcademicYear } from '@/server/models/academicYear';
import { Branch } from '@/server/models/branch';
import { Class } from '@/server/models/class';
import { Counter } from '@/server/models/counter';
import { Enrollment } from '@/server/models/enrollment';
import { Guardian } from '@/server/models/guardian';
import { Organization } from '@/server/models/organization';
import { School } from '@/server/models/school';
import { Section } from '@/server/models/section';
import { Staff } from '@/server/models/staff';
import { Student } from '@/server/models/student';
import { User } from '@/server/models/user';
import { DEMO_TOTP_SECRET } from './demoSecret';

const FIRST_NAMES = [
  'Aarav', 'Ananya', 'Kabir', 'Diya', 'Vivaan', 'Ishita', 'Arjun', 'Meera', 'Rohan', 'Saanvi', 'Aditya', 'Kavya',
  'Reyansh', 'Nisha', 'Farhan', 'Zoya', 'Harpreet', 'Simran', 'Joseph', 'Mary', 'Tenzin', 'Lakshmi', 'Imran', 'Pooja',
];
const LAST_NAMES = [
  'Sharma', 'Verma', 'Mehta', 'Nair', 'Khan', 'Singh', 'Reddy', 'Das', 'Iyer', 'Fernandes', 'Patel', 'Chauhan',
];
const ADDRESS = { line1: '12 School Road', city: 'Bhopal', state: 'Madhya Pradesh', pincode: '462001', country: 'IN' };

async function seedSchool(options: {
  organizationId: Types.ObjectId;
  name: string;
  code: string;
  domain: string;
  phonePrefix: string;
  classes: number[];
  sections: string[];
  studentsPerSection: number;
  staff: {
    role: 'school_admin' | 'principal' | 'teacher' | 'accountant';
    name: string;
    scope: 'school' | 'assigned';
    email?: string;
    withoutTotp?: boolean;
  }[];
  passwordHash: string;
}) {
  const { code } = options;
  const school = await School.create({
    organizationId: options.organizationId,
    name: options.name,
    code,
    board: 'CBSE',
    address: ADDRESS,
    status: 'active',
  });
  const schoolId = school._id;
  const branch = await Branch.create({ schoolId, name: 'Main campus', code: 'MAIN', address: ADDRESS, isDefault: true });
  const year = await AcademicYear.create({
    schoolId,
    label: '2026–27',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    status: 'current',
  });
  const scoped = { schoolId, branchId: branch._id, academicYearId: year._id };
  const classTeacherId = new Types.ObjectId();
  let admission = 0;

  for (const order of options.classes) {
    const schoolClass = await Class.create({ ...scoped, name: `Class ${order}`, order });
    for (const name of options.sections) {
      const first = order === options.classes[0] && name === options.sections[0];
      const section = await Section.create({
        ...scoped,
        classId: schoolClass._id,
        name,
        displayName: `${order}-${name}`,
        ...(first && { classTeacherId }),
      });

      const students = Array.from({ length: options.studentsPerSection }, (_, index) => {
        admission += 1;
        const lastName = LAST_NAMES[(admission * 7) % LAST_NAMES.length] ?? 'Sharma';
        return {
          _id: new Types.ObjectId(),
          guardianId: new Types.ObjectId(),
          enrollmentId: new Types.ObjectId(),
          firstName: FIRST_NAMES[admission % FIRST_NAMES.length] ?? 'Aarav',
          lastName,
          admissionNo: `${code}-2026-${String(admission).padStart(5, '0')}`,
          phone: `${options.phonePrefix}${String(admission).padStart(5, '0')}`,
          rollNo: index + 1,
        };
      });

      await Guardian.insertMany(
        students.map((s) => ({
          _id: s.guardianId,
          schoolId,
          name: `${s.rollNo % 2 ? 'Sunita' : 'Rajesh'} ${s.lastName}`,
          relation: s.rollNo % 2 ? 'mother' : 'father',
          phone: s.phone,
          studentIds: [s._id],
        })),
      );
      await Student.insertMany(
        students.map((s) => ({
          _id: s._id,
          schoolId,
          branchId: branch._id,
          admissionNo: s.admissionNo,
          firstName: s.firstName,
          lastName: s.lastName,
          dob: `${2026 - 5 - order}-0${(s.rollNo % 9) + 1}-15`,
          gender: s.rollNo % 2 ? 'female' : 'male',
          guardianIds: [s.guardianId],
          primaryGuardianId: s.guardianId,
          status: s.rollNo === options.studentsPerSection ? 'transferred' : 'active',
          currentEnrollmentId: s.enrollmentId,
        })),
      );
      await Enrollment.insertMany(
        students.map((s) => ({
          _id: s.enrollmentId,
          ...scoped,
          studentId: s._id,
          classId: schoolClass._id,
          sectionId: section._id,
          rollNo: s.rollNo,
          status: s.rollNo === options.studentsPerSection ? 'transferred' : 'active',
        })),
      );
    }
  }

  const teacher = options.staff.find((member) => member.role === 'teacher');
  if (teacher) {
    await Staff.create({
      _id: classTeacherId,
      schoolId,
      branchId: branch._id,
      employeeNo: 'EMP-0001',
      name: teacher.name,
      phone: `${options.phonePrefix}99999`,
      designation: 'TGT Mathematics',
      type: 'teaching',
      joinedOn: '2022-04-01',
    });
    await Counter.create({ _id: `${schoolId.toString()}:employee`, seq: 1 });
  }

  await User.insertMany(
    options.staff.map(({ role, name, scope, email, withoutTotp }) => ({
      name,
      email: `${email ?? (role === 'school_admin' ? 'admin' : role)}@${options.domain}`,
      passwordHash: options.passwordHash,
      roles: [{ role, schoolId, scope }],
      status: 'active',
      ...(role === 'teacher' && { staffId: classTeacherId }),
      ...(TOTP_REQUIRED_ROLES.includes(role) &&
        !withoutTotp && { totp: { secret: seal(DEMO_TOTP_SECRET), enabledAt: new Date() } }),
    })),
  );
  await Counter.create({ _id: `${schoolId.toString()}:admission:2026`, seq: admission });
  return admission;
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('The seed script must never run against production');
  await connectDb();

  // Every collection goes, including ones this script doesn't fill (attendance, invoices, receipts), so nothing is
  // left pointing at schools that no longer exist.
  await mongoose.connection.dropDatabase();
  const models = [Counter, Organization, School, Branch, AcademicYear, Class, Section, Guardian, Student, Enrollment, Staff, User];
  for (const model of models) await model.syncIndexes();

  const password = process.env.SEED_PASSWORD ?? 'Vidyawan#Demo2026';
  const passwordHash = await hashPassword(password);
  const organization = await Organization.create({
    name: 'Green Valley Education Trust',
    billingEmail: 'accounts@greenvalley.example',
    plan: 'growth',
  });

  const greenValley = await seedSchool({
    organizationId: organization._id,
    name: 'Green Valley School',
    code: 'VWN',
    domain: 'greenvalley.example',
    phonePrefix: '+9190001',
    classes: [6, 7, 8, 9, 10],
    sections: ['A', 'B'],
    studentsPerSection: 30,
    passwordHash,
    staff: [
      { role: 'school_admin', name: 'Meena Joshi', scope: 'school' },
      { role: 'principal', name: 'Dr. Suresh Rao', scope: 'school' },
      { role: 'teacher', name: 'Priya Nair', scope: 'assigned' },
      { role: 'accountant', name: 'Ramesh Gupta', scope: 'school' },
      { role: 'accountant', name: 'Kavita Rao', scope: 'school', email: 'newaccountant', withoutTotp: true },
    ],
  });
  const riverside = await seedSchool({
    organizationId: organization._id,
    name: 'Riverside Public School',
    code: 'RPS',
    domain: 'riverside.example',
    phonePrefix: '+9190002',
    classes: [5],
    sections: ['A'],
    studentsPerSection: 12,
    passwordHash,
    staff: [{ role: 'school_admin', name: 'Anita Desai', scope: 'school' }],
  });

  console.log(`Seeded ${greenValley} students in Green Valley School and ${riverside} in Riverside Public School.`);
  console.log(`Sign in with admin@greenvalley.example, principal@…, teacher@…, accountant@… or admin@riverside.example`);
  console.log(`Password: ${password}`);
  console.log('Admins, the principal and the accountant are also asked for a code: run `npm run totp`,');
  console.log(`or add the key ${DEMO_TOTP_SECRET} to an authenticator app.`);
  console.log('newaccountant@greenvalley.example sets up two-step verification at first sign-in.');
  await mongoose.disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
