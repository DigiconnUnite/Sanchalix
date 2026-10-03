import { MongoMemoryReplSet } from 'mongodb-memory-server';

export default async function setup() {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replSet.getUri('vidyawan_test');
  process.env.APP_URL = 'http://localhost:3000';
  process.env.AUTH_SECRET = 'test-only-secret-test-only-secret-0123';
  return () => replSet.stop();
}
