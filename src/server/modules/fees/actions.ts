'use server';

import 'server-only';
import { Types } from 'mongoose';
import { withAction } from '@/server/action';
import { audit } from '@/server/audit';
import { getTranslations } from 'next-intl/server';
import { requirePermission } from '@/server/auth/context';
import { sendDuesReminders as remind } from '@/server/messaging/alerts';
import { getSchoolBrand } from '@/server/platform/queries';
import { z } from 'zod';
import { CheckoutInput, createCheckout as checkout, OrderId, payWithDevGateway } from './online';
import { collectPayment as collect } from './paymentService';
import { CollectPayment, FeeHeadInput, FeeStructureId, FeeStructureInput } from './schemas';
import { approveFeeStructure as approve, createFeeHead, createFeeStructure, deleteDraftFeeStructure } from './service';

const TestPayment = z.object({ orderId: OrderId, outcome: z.enum(['captured', 'failed']) });

export async function createCheckout(input: unknown) {
  return withAction('fees.checkout.create', async () => {
    const ctx = await requirePermission('portal.self.read');
    const order = await checkout(ctx, CheckoutInput.parse(input));
    if (!order.reused) {
      await audit(ctx, 'fees.checkout.create', { type: 'school', id: ctx.schoolId }, {
        after: { orderId: order.orderId, amountMinor: order.amountMinor },
      });
    }
    return { orderId: order.orderId };
  });
}

export async function payTestOrder(input: unknown) {
  return withAction('fees.checkout.pay', async () => {
    const ctx = await requirePermission('portal.self.read');
    const { orderId, outcome } = TestPayment.parse(input);
    const result = await payWithDevGateway(ctx, orderId, outcome);
    if (result.status === 'paid') {
      await audit(ctx, 'fees.payment.create', { type: 'payment', id: result.paymentId }, {
        after: { receiptNo: result.receiptNo, method: 'online', orderId },
      });
    }
    return { status: result.status };
  });
}

export async function sendDuesReminders() {
  return withAction('fees.reminder.create', async () => {
    const ctx = await requirePermission('fees.payment.create');
    const [t, school] = await Promise.all([getTranslations('outbound'), getSchoolBrand(ctx.schoolId)]);
    const result = await remind(ctx, ({ student, amount }) => t('dues', { school: school.name, student, amount }));
    await audit(ctx, 'fees.reminder.create', { type: 'school', id: ctx.schoolId }, { after: result });
    return result;
  });
}

export async function deleteFeeStructure(input: unknown) {
  return withAction('fees.structure.delete', async () => {
    const ctx = await requirePermission('fees.structure.update');
    const structure = await deleteDraftFeeStructure(ctx, FeeStructureId.parse(input));
    await audit(ctx, 'fees.structure.delete', { type: 'feeStructure', id: structure.id }, {
      before: { name: structure.name, status: 'draft' },
    });
    return { name: structure.name };
  });
}

export async function upsertFeeHead(input: unknown) {
  return withAction('fees.structure.update', async () => {
    const ctx = await requirePermission('fees.structure.update');
    const data = FeeHeadInput.parse(input);
    const head = await createFeeHead(ctx, data);
    await audit(ctx, 'fees.feeHead.create', { type: 'feeHead', id: head.id }, { after: data });
    return { name: head.name };
  });
}

export async function upsertFeeStructure(input: unknown) {
  return withAction('fees.structure.update', async () => {
    const ctx = await requirePermission('fees.structure.update');
    const data = FeeStructureInput.parse(input);
    const structure = await createFeeStructure(ctx, data);
    await audit(ctx, 'fees.structure.create', { type: 'feeStructure', id: structure.id }, {
      after: { name: data.name, lines: data.lines.length, installments: data.installments.length },
    });
    return { name: structure.name };
  });
}

export async function approveFeeStructure(input: unknown) {
  return withAction('fees.structure.approve', async () => {
    const ctx = await requirePermission('fees.structure.approve');
    const id = FeeStructureId.parse(input);
    const result = await approve(ctx, id);
    await audit(ctx, 'fees.structure.approve', { type: 'feeStructure', id: new Types.ObjectId(id) }, {
      after: { status: 'active', invoicesIssued: result.invoicesIssued },
    });
    return result;
  });
}

export async function collectPayment(input: unknown) {
  return withAction('fees.payment.create', async () => {
    const ctx = await requirePermission('fees.payment.create');
    const data = CollectPayment.parse(input);
    const payment = await collect(ctx, data);
    if (!payment.repeated) {
      await audit(ctx, 'fees.payment.create', { type: 'payment', id: payment.id }, {
        after: { receiptNo: payment.receiptNo, amountMinor: payment.amountMinor, method: data.method },
      });
    }
    return { paymentId: String(payment.id), receiptNo: payment.receiptNo };
  });
}
