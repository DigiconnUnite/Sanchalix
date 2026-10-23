import 'server-only';
import { Schema } from 'mongoose';
import { defineModel } from './shared';

const ObjectId = Schema.Types.ObjectId;

// What platform staff do across schools: signing in, creating a school, suspending one. It belongs to no school, so a
// school's own audit log never shows it and a school can't change it.
const schema = new Schema({
  actorId: { type: ObjectId, ref: 'User', required: true },
  action: { type: String, required: true },
  entity: {
    type: { type: String, required: true },
    id: { type: ObjectId },
  },
  targetSchoolId: { type: ObjectId, ref: 'School' },
  before: Schema.Types.Mixed,
  after: Schema.Types.Mixed,
  reason: String,
  ip: String,
  userAgent: String,
  at: { type: Date, required: true, default: Date.now },
});

schema.index({ at: -1 });
schema.index({ targetSchoolId: 1, at: -1 });

export const PlatformAuditLog = defineModel('PlatformAuditLog', schema, 'platformAuditLogs');
