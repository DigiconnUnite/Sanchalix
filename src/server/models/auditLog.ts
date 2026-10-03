import 'server-only';
import { Schema } from 'mongoose';
import { ROLE_KEYS } from '@/server/auth/permissions';
import { defineTenantModel } from './shared';

const ObjectId = Schema.Types.ObjectId;

const schema = new Schema({
  actorId: { type: ObjectId, ref: 'User', required: true },
  actorRole: { type: String, required: true, enum: ROLE_KEYS },
  action: { type: String, required: true },
  entity: {
    type: { type: String, required: true },
    id: { type: ObjectId, required: true },
  },
  before: Schema.Types.Mixed,
  after: Schema.Types.Mixed,
  ip: String,
  userAgent: String,
  requestId: String,
  reason: String,
  at: { type: Date, required: true, default: Date.now },
});

schema.index({ schoolId: 1, at: -1 });
schema.index({ schoolId: 1, 'entity.type': 1, 'entity.id': 1, at: -1 });
schema.index({ schoolId: 1, actorId: 1, at: -1 });

export const AuditLog = defineTenantModel('AuditLog', schema, 'auditLogs');
