import 'server-only';
import { Schema } from 'mongoose';
import { audit, DATE_STR, defineTenantModel } from './shared';

const ObjectId = Schema.Types.ObjectId;

export const STAFF_ATTENDANCE_STATUSES = ['present', 'absent', 'half_day', 'leave', 'holiday'] as const;

const schema = new Schema(
  {
    branchId: { type: ObjectId, ref: 'Branch', required: true },
    staffId: { type: ObjectId, ref: 'Staff', required: true },
    date: { type: String, required: true, match: DATE_STR },
    checkIn: Date,
    checkOut: Date,
    status: { type: String, required: true, enum: STAFF_ATTENDANCE_STATUSES },
    source: { type: String, enum: ['manual', 'qr', 'biometric'], default: 'manual' },
    deviceId: ObjectId,
    ...audit,
  },
  { timestamps: true },
);

schema.index({ schoolId: 1, staffId: 1, date: 1 }, { unique: true });

export const StaffAttendance = defineTenantModel('StaffAttendance', schema, 'staffAttendance');
