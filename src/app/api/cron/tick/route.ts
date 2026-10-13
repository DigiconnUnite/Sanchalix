import { timingSafeEqual } from 'node:crypto';
import { connectDb } from '@/server/db/connect';
import { logger } from '@/server/logger';
import { School } from '@/server/models/school';
import { publishDueAnnouncements } from '@/server/modules/comms/service';
import { runFeeUpkeep } from '@/server/modules/fees/discounts';

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * The scheduled jobs, run for every school. Whatever calls this on a timer (the host's cron, a system scheduler)
 * sends `Authorization: Bearer $CRON_SECRET`. Every job is safe to repeat, so the timer can fire as often as it
 * likes and a missed run is made up by the next.
 * ponytail: jobs run inside this one request. Move them to a queue with a worker when a run nears the host's time
 * limit (ADR-023).
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: { code: 'UNAVAILABLE' } }, { status: 503 });
  if (!same(request.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return Response.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 });
  }

  await connectDb();
  const schools = await School.find({ status: { $ne: 'suspended' } }).select('_id').lean();
  const totals = { schools: schools.length, overdue: 0, lateFees: 0, announcements: 0, failed: 0 };
  for (const school of schools) {
    try {
      const fees = await runFeeUpkeep(school._id);
      totals.overdue += fees.overdue;
      totals.lateFees += fees.lateFees;
      totals.announcements += await publishDueAnnouncements(school._id);
    } catch (error) {
      // One school's failure must not stop the others; the next run tries it again.
      totals.failed += 1;
      logger.error({ err: error, schoolId: String(school._id) }, 'cron.tick.school_failed');
    }
  }
  logger.info(totals, 'cron.tick');
  return Response.json({ ok: true, data: totals });
}
