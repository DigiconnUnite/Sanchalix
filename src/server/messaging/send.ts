import 'server-only';
import type { Types } from 'mongoose';
import type { RequestContext } from '@/server/auth/context';
import { logger } from '@/server/logger';
import { OutboundMessage } from '@/server/models/outboundMessage';
import { School } from '@/server/models/school';
import { AttendanceRecord } from '@/server/models/attendanceRecord';
import { type QuietHours, quietUntil } from './quietHours';

export type Outbound = {
  schoolId: Types.ObjectId;
  channel: 'sms' | 'email';
  to: string;
  /** What kind of message this is (`absence`, `dues`, `otp`, `passwordReset`), for the record and for reports. */
  template: string;
  subject?: string;
  body: string;
  /** The same key is sent once per school: a second absence alert for the same child and day is dropped. */
  dedupeKey?: string;
  /** Sign-in codes and absence alerts go at once. Anything else waits out the school's quiet hours. */
  urgent?: boolean;
  /** Not before this moment. Used to send absence alerts at the school's alert time, not the second the sheet is saved. */
  notBefore?: Date;
  /** Looked at again at send time: the text is dropped if the child is no longer marked absent for the day. */
  recheck?: { studentId: Types.ObjectId; date: string };
};

// ponytail: there is one provider, "dev", which records the message instead of delivering it, so every flow can be
// tried without an SMS or email account. When the MSG91 and SES keys arrive, deliver here by channel and keep the
// record (without the body) as the delivery log.
const PROVIDER = 'dev';

/** Hands messages to the provider and returns how many were accepted. Duplicates of a dedupe key are not counted. */
export async function sendMessages(messages: Outbound[]) {
  if (messages.length === 0) return 0;
  // Outside development nothing can be delivered yet, and a body may hold a code or a child's name, so it isn't kept.
  const live = process.env.NODE_ENV === 'production';
  const schools = await School.find({ _id: { $in: [...new Set(messages.map((message) => String(message.schoolId)))] } })
    .select('timezone settings.quietHours')
    .lean();
  const quietOf = new Map(
    schools.map((school) => [String(school._id), { timezone: school.timezone ?? 'Asia/Kolkata', quiet: school.settings?.quietHours }]),
  );
  try {
    const saved = await OutboundMessage.insertMany(
      messages.map(({ body, urgent, notBefore, ...message }) => {
        const own = quietOf.get(String(message.schoolId));
        const quiet =
          message.channel === 'sms' && !urgent && own?.quiet ? quietUntil(own.timezone, own.quiet as QuietHours) : null;
        const later = notBefore && notBefore > new Date() ? notBefore : null;
        const until = quiet && later ? (quiet > later ? quiet : later) : (quiet ?? later);
        // A held text keeps its body, even in production, because it still has to be sent.
        return {
          ...message,
          ...((!live || until) && { body }),
          status: until ? 'held' : live ? 'skipped' : 'sent',
          ...(until && { sendAfter: until }),
          provider: PROVIDER,
        };
      }),
      { ordered: false },
    );
    return saved.length;
  } catch (error) {
    // An unordered insert reports the duplicates it skipped and still saves the rest.
    const result = error as { code?: number; insertedDocs?: unknown[]; writeErrors?: { code?: number }[] };
    const onlyDuplicates = result.code === 11000 || result.writeErrors?.every((failure) => failure.code === 11000);
    if (!onlyDuplicates) logger.error({ err: error }, 'outbound messages failed');
    return result.insertedDocs?.length ?? 0;
  }
}

/**
 * Sends the school's held texts whose quiet hours are over. A message is claimed before it is sent, so two runs at
 * once can't send it twice.
 */
export async function releaseHeldMessages(schoolId: Types.ObjectId) {
  const live = process.env.NODE_ENV === 'production';
  let released = 0;
  for (;;) {
    const held = await OutboundMessage.findOne({ schoolId, status: 'held', sendAfter: { $lte: new Date() } })
      .select('recheck')
      .lean();
    if (!held) return released;
    const studentId = held.recheck?.studentId;
    const date = held.recheck?.date;
    // A teacher may have corrected the register while the alert waited. A child who is no longer absent is not texted.
    const stillAbsent =
      !studentId ||
      !date ||
      Boolean(
        await AttendanceRecord.exists({
          schoolId,
          mode: 'daily',
          date,
          entries: { $elemMatch: { studentId, status: 'absent' } },
        }),
      );
    // Claimed by its status, so two runs at once can't both send it.
    const claimed = await OutboundMessage.updateOne(
      { schoolId, _id: held._id, status: 'held' },
      {
        status: stillAbsent ? (live ? 'skipped' : 'sent') : 'skipped',
        ...(!stillAbsent && { error: 'No longer marked absent' }),
        $unset: { sendAfter: 1, ...((live || !stillAbsent) && { body: 1 }) },
      },
    );
    if (claimed.modifiedCount === 1 && stillAbsent) released += 1;
  }
}

export type OutboxRow = {
  id: string;
  channel: 'sms' | 'email';
  to: string;
  template: string;
  body: string | null;
  status: string;
  sentAt: string;
};

/** The school's most recent messages, newest first. In development this is where a code or a reset link is read. */
export async function listOutbox(ctx: RequestContext): Promise<OutboxRow[]> {
  const messages = await OutboundMessage.find({ schoolId: ctx.schoolId })
    .sort({ createdAt: -1 })
    .limit(100)
    .select('channel to template subject body status createdAt')
    .lean();
  return messages.map((message) => ({
    id: String(message._id),
    channel: message.channel,
    to: message.to,
    template: message.template,
    body: message.body ?? null,
    status: message.status,
    sentAt: message.createdAt.toISOString(),
  }));
}
