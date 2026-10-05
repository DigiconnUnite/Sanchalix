import 'server-only';
import { Schema } from 'mongoose';
import { audit, DATE_STR, defineTenantModel } from './shared';

const ObjectId = Schema.Types.ObjectId;

export const LEAVE_TYPES = ['CL', 'SL', 'EL', 'LOP'] as const;
export const LEAVE_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;

const schema = new Schema(
  {
    requesterType: { type: String, required: true, enum: ['staff', 'student'] as const },
    requesterId: { type: ObjectId, required: true },
    leaveTypeCode: { type: String, required: true, enum: LEAVE_TYPES },
    from: { type: String, required: true, match: DATE_STR },
    to: { type: String, required: true, match: DATE_STR },
    halfDay: { type: Boolean, default: false },
    reason: { type: String, required: true, maxlength: 300 },
    attachmentKey: String,
    status: { type: String, enum: LEAVE_STATUSES, default: 'pending' },
    approvals: [
      {
        _id: false,
        level: Number,
        approverId: { type: ObjectId, ref: 'User' },
        decision: { type: String, enum: ['approved', 'rejected'] as const },
        comment: String,
        at: Date,
      },
    ],
    ...audit,
  },
  { timestamps: true },
);

schema.index({ schoolId: 1, status: 1, from: 1 });
schema.index({ schoolId: 1, requesterId: 1, from: -1 });

export const LeaveRequest = defineTenantModel('LeaveRequest', schema, 'leaveRequests');
