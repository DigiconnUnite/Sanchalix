import { Types } from 'mongoose';
import { connectDb } from '@/server/db/connect';
import { logger } from '@/server/logger';
import { handleGatewayEvent, verifyRazorpaySignature } from '@/server/modules/fees/online';

type RazorpayEvent = {
  event?: string;
  payload?: { payment?: { entity?: { id?: string; order_id?: string; amount?: number; notes?: { schoolId?: string } } } };
};

/**
 * Razorpay's payment events. Nothing is trusted until the signature over the raw body checks out against the
 * webhook secret; without a secret configured the endpoint is off. The school comes from the order's notes, which
 * we set when the order is created.
 */
export async function POST(request: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return new Response('Razorpay is not configured', { status: 503 });

  const rawBody = await request.text();
  if (!verifyRazorpaySignature(rawBody, request.headers.get('x-razorpay-signature') ?? '', secret)) {
    return new Response('Invalid signature', { status: 401 });
  }
  const event = JSON.parse(rawBody) as RazorpayEvent;
  const payment = event.payload?.payment?.entity;
  const eventId = request.headers.get('x-razorpay-event-id');
  const type = event.event;
  const schoolId = payment?.notes?.schoolId;
  // Events we don't act on are acknowledged, so Razorpay doesn't keep retrying them.
  if (
    !eventId ||
    !payment?.id ||
    !payment.order_id ||
    !schoolId ||
    !Types.ObjectId.isValid(schoolId) ||
    (type !== 'payment.captured' && type !== 'payment.failed')
  ) {
    return new Response('Ignored', { status: 200 });
  }

  await connectDb();
  try {
    await handleGatewayEvent({
      provider: 'razorpay',
      eventId,
      type,
      schoolId: new Types.ObjectId(schoolId),
      orderId: payment.order_id,
      gatewayPaymentId: payment.id,
      amountMinor: payment.amount ?? 0,
    });
  } catch (error) {
    logger.error({ err: error, eventId }, 'razorpay webhook failed');
    return new Response('Try again', { status: 500 });
  }
  return new Response('OK', { status: 200 });
}
