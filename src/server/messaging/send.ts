import 'server-only';
import type { Types } from 'mongoose';
import type { RequestContext } from '@/server/auth/context';
import { logger } from '@/server/logger';
import { OutboundMessage } from '@/server/models/outboundMessage';

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
  try {
    const saved = await OutboundMessage.insertMany(
      messages.map(({ body, ...message }) => ({
        ...message,
        ...(!live && { body }),
        status: live ? 'skipped' : 'sent',
        provider: PROVIDER,
      })),
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
