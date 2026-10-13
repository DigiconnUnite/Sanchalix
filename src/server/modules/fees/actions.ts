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
import { ImportStudents as ImportFile } from '@/server/modules/sis/schemas';
import { importOpeningBalances as importBalances } from './openingBalances';
import { collectPayment as collect } from './paymentService';
import {
  AutomaticDiscounts,
  decideStudentDiscount as decide,
  DiscountDecision,
  LateFeeRule,
  requestStudentDiscount as request,
  setAutomaticDiscounts as setAutomatic,
  setLateFeeRule as setLateFee,
  StudentDiscount,
  withdrawStudentDiscount as withdrawDiscount,
} from './discounts';
import { CollectPayment, FeeHeadDiscountable, FeeHeadInput, FeeStructureId, FeeStructureInput } from './schemas';
import {
  approveFeeStructure as approve,
  createFeeHead,
  createFeeStructure,
  deleteDraftFeeStructure,
  setFeeHeadDiscountable as setDiscountable,
} from './service';

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

export async function setFeeHeadDiscountable(input: unknown) {
  return withAction('fees.feeHead.update', async () => {
    const ctx = await requirePermission('fees.structure.update');
    const { id, discountable } = FeeHeadDiscountable.parse(input);
    const head = await setDiscountable(ctx, id, discountable);
    await audit(ctx, 'fees.feeHead.update', { type: 'feeHead', id: head.id }, {
      before: { discountable: head.before },
      after: { discountable },
    });
    return { name: head.name, discountable };
  });
}

export async function saveAutomaticDiscounts(input: unknown) {
  return withAction('fees.discount.update', async () => {
    const ctx = await requirePermission('fees.discount.update');
    const data = AutomaticDiscounts.parse(input);
    const t = await getTranslations('fees.discounts.kinds');
    const { before } = await setAutomatic(ctx, data, { sibling: t('sibling'), staff_ward: t('staff_ward') });
    await audit(ctx, 'fees.discount.update', { type: 'school', id: ctx.schoolId }, { before, after: data });
    return data;
  });
}

export async function saveLateFeeRule(input: unknown) {
  return withAction('fees.lateFee.update', async () => {
    const ctx = await requirePermission('fees.discount.update');
    const data = LateFeeRule.parse(input);
    const { before } = await setLateFee(ctx, data);
    await audit(ctx, 'fees.lateFee.update', { type: 'school', id: ctx.schoolId }, {
      before: before ? { amountMinor: before.amountMinor, graceDays: before.graceDays } : {},
      after: data,
    });
    return data;
  });
}

export async function requestStudentDiscount(input: unknown) {
  return withAction('fees.discount.create', async () => {
    const ctx = await requirePermission('fees.discount.update');
    const data = StudentDiscount.parse(input);
    const discount = await request(ctx, data);
    await audit(ctx, 'fees.discount.create', { type: 'discount', id: discount.id }, {
      after: { type: data.type, value: data.value },
      reason: data.reason,
    });
    return { student: discount.student };
  });
}

export async function decideStudentDiscount(input: unknown) {
  return withAction('fees.discount.approve', async () => {
    const ctx = await requirePermission('fees.discount.approve');
    const data = DiscountDecision.parse(input);
    const discount = await decide(ctx, data);
    await audit(ctx, 'fees.discount.approve', { type: 'discount', id: discount.id }, {
      before: { status: 'pending' },
      after: { status: data.decision, invoices: discount.invoices },
    });
    return { name: discount.name, decision: data.decision, invoices: discount.invoices };
  });
}

export async function withdrawStudentDiscount(input: unknown) {
  return withAction('fees.discount.withdraw', async () => {
    const ctx = await requirePermission('fees.discount.approve');
    const discount = await withdrawDiscount(ctx, FeeStructureId.parse(input));
    await audit(ctx, 'fees.discount.withdraw', { type: 'discount', id: discount.id }, {
      before: { status: 'approved' },
      after: { status: 'withdrawn', invoices: discount.invoices },
    });
    return { name: discount.name, invoices: discount.invoices };
  });
}

export async function importOpeningBalances(input: unknown) {
  return withAction('fees.openingBalance.import', async () => {
    const ctx = await requirePermission('fees.structure.update');
    const { csv, dryRun } = ImportFile.parse(input);
    const t = await getTranslations();
    const report = await importBalances(ctx, csv, dryRun, t('fees.openingBalances.label'));
    if (report.imported > 0) {
      await audit(ctx, 'fees.openingBalance.import', { type: 'school', id: ctx.schoolId }, {
        after: { invoices: report.imported },
      });
    }
    return {
      total: report.total,
      imported: report.imported,
      errorCount: report.errors.length,
      errors: report.errors.slice(0, 100).map(({ row, field, messageKey }) => ({ row, field, message: t(messageKey) })),
    };
  });
}

export async function upsertFeeStructure(input: unknown) {
  return withAction('fees.structure.update', async () => {
    const ctx = await requirePermission('fees.structure.update');
    const { id, ...data } = FeeStructureInput.extend({ id: FeeStructureId.optional() }).parse(input);
    const structure = await createFeeStructure(ctx, data, id);
    await audit(ctx, id ? 'fees.structure.update' : 'fees.structure.create', { type: 'feeStructure', id: structure.id }, {
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
