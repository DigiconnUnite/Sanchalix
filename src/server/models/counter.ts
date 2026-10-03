import 'server-only';
import { Schema } from 'mongoose';
import { defineModel } from './shared';

// _id is `{schoolId}:{kind}:{year}`, so the tenant is part of the key instead of a field.
const schema = new Schema({ _id: { type: String, required: true }, seq: { type: Number, required: true, default: 0 } });

export const Counter = defineModel('Counter', schema, 'counters');
