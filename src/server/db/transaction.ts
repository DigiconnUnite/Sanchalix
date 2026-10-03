import 'server-only';
import mongoose, { type ClientSession } from 'mongoose';

export async function withTransaction<T>(run: (session: ClientSession) => Promise<T>) {
  let result: T | undefined;
  await mongoose.connection.transaction(async (session) => {
    result = await run(session);
  });
  return result as T;
}
