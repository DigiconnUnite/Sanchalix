import 'server-only';
import { Schema } from 'mongoose';
import { defineModel } from './shared';

// _id is `{bucket}:{who}:{window}`, one counter per caller per time window. It expires on its own.
const schema = new Schema({
  _id: { type: String, required: true },
  count: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true },
});
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RateLimit = defineModel('RateLimit', schema, 'rateLimits');
