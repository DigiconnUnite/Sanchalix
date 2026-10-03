import mongoose, { Schema, Types } from 'mongoose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TenantScopeError, tenantPlugin } from './tenantPlugin';

type Thing = { name: string; schoolId: Types.ObjectId; deletedAt: Date | null };
const Thing = mongoose.model('TenantThing', new Schema<Thing>({ name: String }).plugin(tenantPlugin));
const schoolA = new Types.ObjectId();
const schoolB = new Types.ObjectId();

it('rejects queries without schoolId', async () => {
  await expect(Thing.find({})).rejects.toThrow(TenantScopeError);
  await expect(Thing.updateMany({}, { name: 'x' })).rejects.toThrow(TenantScopeError);
  await expect(Thing.deleteMany({ name: 'a-live' })).rejects.toThrow(TenantScopeError);
  await expect(Thing.countDocuments()).rejects.toThrow(TenantScopeError);
});

it('rejects aggregates that do not start with a schoolId match', async () => {
  await expect(Thing.aggregate([{ $group: { _id: null } }])).rejects.toThrow(TenantScopeError);
});

describe('with a database', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI ?? '');
    await Thing.collection.deleteMany({});
    await Thing.create([
      { schoolId: schoolA, name: 'a-live' },
      { schoolId: schoolA, name: 'a-deleted', deletedAt: new Date() },
      { schoolId: schoolB, name: 'b-live' },
    ]);
  });

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) await Thing.collection.drop();
    await mongoose.disconnect();
  });

  it('returns only the school’s live documents', async () => {
    const rows = await Thing.find({ schoolId: schoolA }).lean();
    expect(rows.map((r) => r.name)).toEqual(['a-live']);
  });

  it('includes soft-deleted documents when asked', async () => {
    const rows = await Thing.find({ schoolId: schoolA }).setOptions({ withDeleted: true }).lean();
    expect(rows).toHaveLength(2);
  });

  it('allows a scoped aggregate', async () => {
    const [row] = await Thing.aggregate([{ $match: { schoolId: schoolB } }, { $count: 'n' }]);
    expect(row.n).toBe(1);
  });
});
