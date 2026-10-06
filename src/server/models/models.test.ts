/// <reference types="vite/client" />
import mongoose from 'mongoose';
import { expect, it } from 'vitest';
import { TenantScopeError } from '@/server/db/tenantPlugin';

import.meta.glob(['./*.ts', '!./*.test.ts'], { eager: true });

const PLATFORM = ['Counter', 'Organization', 'School', 'User', 'Session', 'OtpChallenge'];

it('registers every model as either tenant-scoped or platform-level', () => {
  const unscoped = mongoose.modelNames().filter((name) => !mongoose.model(name).schema.path('schoolId'));
  expect(unscoped.sort()).toEqual([...PLATFORM].sort());
});

it.each(mongoose.modelNames().filter((name) => !PLATFORM.includes(name)))(
  '%s rejects a query without schoolId',
  async (name) => {
    await expect(mongoose.model(name).find({})).rejects.toThrow(TenantScopeError);
    await expect(mongoose.model(name).countDocuments()).rejects.toThrow(TenantScopeError);
  },
);
