import 'server-only';
import { AppError } from '@/lib/appError';

const ORDERS = 'https://api.razorpay.com/v1/orders';

/** The school-wide Razorpay account, from the environment. Both keys have to be set; with neither, the stand-in gateway is used. */
export function razorpayKeys() {
  const { RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: keySecret } = process.env;
  return keyId && keySecret ? { keyId, keySecret } : null;
}

/**
 * Opens a payment for an exact amount at Razorpay and returns its order id. The money is only confirmed later, by
 * the signed webhook, never by anything the browser reports. `notes` come back on every event, which is how the
 * webhook knows which school an order belongs to.
 */
export async function createRazorpayOrder(
  keys: { keyId: string; keySecret: string },
  order: { amountMinor: number; receipt: string; notes: Record<string, string> },
) {
  let response: Response;
  try {
    response = await fetch(ORDERS, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString('base64')}`,
      },
      body: JSON.stringify({ amount: order.amountMinor, currency: 'INR', receipt: order.receipt, notes: order.notes }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AppError('PAYMENT_FAILED', 'fees.online.errors.gateway');
  }
  const body = (await response.json().catch(() => null)) as { id?: string } | null;
  if (!response.ok || !body?.id || !/^order_[A-Za-z0-9]+$/.test(body.id)) {
    throw new AppError('PAYMENT_FAILED', 'fees.online.errors.gateway');
  }
  return body.id;
}

/** The payments Razorpay has recorded against one order. */
export async function fetchOrderPayments(keys: { keyId: string; keySecret: string }, orderId: string) {
  let response: Response;
  try {
    response = await fetch(`${ORDERS}/${encodeURIComponent(orderId)}/payments`, {
      headers: { Authorization: `Basic ${Buffer.from(`${keys.keyId}:${keys.keySecret}`).toString('base64')}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AppError('PAYMENT_FAILED', 'fees.online.errors.gateway');
  }
  const body = (await response.json().catch(() => null)) as { items?: { id?: string; status?: string; amount?: number }[] } | null;
  if (!response.ok || !Array.isArray(body?.items)) throw new AppError('PAYMENT_FAILED', 'fees.online.errors.gateway');
  return body.items.flatMap((item) =>
    item.id && typeof item.amount === 'number' && item.status ? [{ id: item.id, status: item.status, amountMinor: item.amount }] : [],
  );
}
