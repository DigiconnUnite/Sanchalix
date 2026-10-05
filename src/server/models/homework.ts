import 'server-only';
import { Schema } from 'mongoose';
import { audit, DATE_STR, defineTenantModel } from './shared';

const ObjectId = Schema.Types.ObjectId;

const schema = new Schema(
  {
    sectionIds: { type: [{ type: ObjectId, ref: 'Section' }], required: true },
    subjectId: { type: ObjectId, ref: 'Subject', required: true },
    teacherId: { type: ObjectId, ref: 'Staff', required: true },
    title: { type: String, required: true, maxlength: 120 },
    instructions: { type: String, default: '' },
    assignedOn: { type: String, required: true, match: DATE_STR },
    dueOn: { type: String, required: true, match: DATE_STR },
    graded: { type: Boolean, default: false },
    maxMarks: Number,
    allowLate: { type: Boolean, default: true },
    status: { type: String, enum: ['draft', 'published', 'closed'], default: 'published' },
    ...audit,
  },
  { timestamps: true },
);

schema.index({ schoolId: 1, sectionIds: 1, dueOn: -1 });
schema.index({ schoolId: 1, teacherId: 1, dueOn: -1 });

export const Homework = defineTenantModel('Homework', schema, 'homework');
