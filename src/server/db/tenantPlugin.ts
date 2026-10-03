import 'server-only';
import { type MongooseQueryMiddleware, Schema } from 'mongoose';

export class TenantScopeError extends Error {
  constructor(operation: string) {
    super(`${operation} on a tenant collection must be scoped by schoolId`);
    this.name = 'TenantScopeError';
  }
}

const QUERY_OPERATIONS: MongooseQueryMiddleware[] = [
  'find',
  'findOne',
  'findOneAndUpdate',
  'findOneAndDelete',
  'findOneAndReplace',
  'countDocuments',
  'distinct',
  'updateOne',
  'updateMany',
  'replaceOne',
  'deleteOne',
  'deleteMany',
];

export function tenantPlugin(schema: Schema) {
  schema.add({
    schoolId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    deletedAt: { type: Date, default: null },
  });

  schema.pre(QUERY_OPERATIONS, function () {
    const filter = this.getFilter();
    if (filter.schoolId == null) throw new TenantScopeError(this.model.modelName);
    const { withDeleted } = this.getOptions() as { withDeleted?: boolean };
    if (!withDeleted && !('deletedAt' in filter)) this.where({ deletedAt: null });
  });

  schema.pre('aggregate', function () {
    const first = this.pipeline()[0];
    const match = first && '$match' in first ? first.$match : undefined;
    if (match?.schoolId == null) throw new TenantScopeError('aggregate');
  });
}
