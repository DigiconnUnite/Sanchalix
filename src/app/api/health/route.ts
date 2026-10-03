import { connectDb } from '@/server/db/connect';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { connection } = await connectDb();
    await connection.db?.admin().ping();
    return Response.json({ status: 'ok' });
  } catch {
    return Response.json({ status: 'unavailable' }, { status: 503 });
  }
}
