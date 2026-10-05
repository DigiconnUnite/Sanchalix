import 'server-only';
import { Schema } from 'mongoose';
import { audit, DATE_STR, defineTenantModel } from './shared';

export const EVENT_TYPES = ['academic', 'exam', 'ptm', 'sports', 'cultural', 'holiday', 'other'] as const;

const schema = new Schema(
  {
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch' },
    title: { type: String, required: true, maxlength: 120 },
    type: { type: String, required: true, enum: EVENT_TYPES },
    // ponytail: only all-day events exist, so start and end are calendar dates. Timed events need a Date pair.
    start: { type: String, required: true, match: DATE_STR },
    end: { type: String, required: true, match: DATE_STR },
    allDay: { type: Boolean, default: true },
    audience: { type: { type: String, enum: ['school', 'role'], default: 'school' }, roles: [String] },
    linked: { kind: String, id: Schema.Types.ObjectId },
    ...audit,
  },
  { timestamps: true },
);

schema.index({ schoolId: 1, start: 1 });

export const Event = defineTenantModel('Event', schema, 'events');
