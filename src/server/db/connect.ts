import 'server-only';
import mongoose from 'mongoose';
import { env } from '@/lib/env';

const cache = globalThis as { vwMongoose?: Promise<typeof mongoose> };

// Cached on globalThis because Next.js dev reloads modules, and each reload would otherwise open a new pool.
export function connectDb() {
  cache.vwMongoose ??= mongoose
    .connect(env.MONGODB_URI, { autoIndex: process.env.NODE_ENV !== 'production', serverSelectionTimeoutMS: 5000 })
    .catch((error: unknown) => {
      delete cache.vwMongoose;
      throw error;
    });
  return cache.vwMongoose;
}
