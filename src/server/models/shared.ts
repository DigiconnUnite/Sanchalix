import 'server-only';
import { type InferSchemaType, type Model, model, models, Schema, type Types } from 'mongoose';
import { tenantPlugin } from '@/server/db/tenantPlugin';

export const DATE_STR = /^\d{4}-\d{2}-\d{2}$/;
export const E164 = /^\+[1-9]\d{7,14}$/;

const ObjectId = Schema.Types.ObjectId;

export const audit = {
  createdBy: { type: ObjectId, ref: 'User' },
  updatedBy: { type: ObjectId, ref: 'User' },
};

export const address = new Schema(
  {
    line1: { type: String, required: true },
    line2: String,
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: {
      type: String,
      required: true,
      validate: function (this: { country?: string }, value: string) {
        return this.country !== 'IN' || /^\d{6}$/.test(value);
      },
    },
    country: { type: String, required: true, default: 'IN' },
  },
  { _id: false },
);

export const documentRef = new Schema({
  type: {
    type: String,
    required: true,
    enum: [
      'birth_certificate',
      'transfer_certificate_prev',
      'aadhaar',
      'photo',
      'report_card_prev',
      'medical',
      'tc',
      'bonafide',
      'other',
    ],
  },
  key: { type: String, required: true },
  fileName: { type: String, required: true },
  mime: { type: String, required: true, enum: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] },
  size: { type: Number, required: true, max: 5 * 1024 * 1024 },
  verifiedBy: { type: ObjectId, ref: 'User' },
  verifiedAt: Date,
});

type TenantFields = { schoolId: Types.ObjectId; deletedAt: Date | null };

// Reuses the registered model because Next.js dev reloads modules, and Mongoose refuses to compile a model twice.
export function defineModel<S extends Schema>(name: string, schema: S, collection: string) {
  type Doc = InferSchemaType<S>;
  return (models[name] as Model<Doc> | undefined) ?? model<Doc>(name, schema as unknown as Schema<Doc>, collection);
}

export function defineTenantModel<S extends Schema>(name: string, schema: S, collection: string) {
  type Doc = InferSchemaType<S> & TenantFields;
  return (
    (models[name] as Model<Doc> | undefined) ??
    model<Doc>(name, schema.plugin(tenantPlugin) as unknown as Schema<Doc>, collection)
  );
}
