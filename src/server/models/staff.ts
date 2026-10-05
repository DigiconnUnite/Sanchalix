import 'server-only';
import { Schema } from 'mongoose';
import { address, audit, DATE_STR, defineTenantModel, E164 } from './shared';

const ObjectId = Schema.Types.ObjectId;

export const STAFF_TYPES = ['teaching', 'non_teaching'] as const;
export const STAFF_STATUSES = ['active', 'on_leave', 'resigned', 'terminated'] as const;

const schema = new Schema(
  {
    branchId: { type: ObjectId, ref: 'Branch', required: true },
    employeeNo: { type: String, required: true },
    name: { type: String, required: true, maxlength: 120 },
    dob: { type: String, match: DATE_STR },
    gender: { type: String, enum: ['female', 'male', 'other', 'undisclosed'] },
    phone: { type: String, required: true, match: E164 },
    email: { type: String, lowercase: true, trim: true },
    address,
    designation: { type: String, required: true },
    department: String,
    type: { type: String, required: true, enum: STAFF_TYPES },
    joinedOn: { type: String, required: true, match: DATE_STR },
    subjectIds: [{ type: ObjectId, ref: 'Subject' }],
    qualifications: [{ _id: false, degree: String, institution: String, year: Number }],
    bank: { type: { accountNo: String, ifsc: String, name: String }, select: false },
    pan: { type: String, select: false },
    salary: {
      type: {
        components: [
          {
            _id: false,
            code: String,
            name: String,
            type: { type: String, enum: ['earning', 'deduction'] },
            amountMinor: Number,
            formula: String,
          },
        ],
        effectiveFrom: String,
      },
      select: false,
    },
    leaveBalances: [{ _id: false, leaveTypeCode: String, year: Number, balance: Number }],
    status: { type: String, enum: STAFF_STATUSES, default: 'active' },
    userId: { type: ObjectId, ref: 'User' },
    ...audit,
  },
  { timestamps: true },
);

schema.index({ schoolId: 1, employeeNo: 1 }, { unique: true });
schema.index({ schoolId: 1, status: 1 });

export const Staff = defineTenantModel('Staff', schema, 'staff');
