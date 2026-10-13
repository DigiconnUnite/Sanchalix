import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { env } from '@/lib/env';
import type { Receipt } from './schemas';

const sign = (schoolId: string, paymentId: string) =>
  createHmac('sha256', env.AUTH_SECRET).update(`receipt:${schoolId}:${paymentId}`).digest('base64url').slice(0, 22);

/** The address printed as a QR code on a receipt. Anyone holding the paper can open it to check the receipt is real. */
export const receiptVerifyUrl = (schoolId: string, paymentId: string) =>
  `${env.APP_URL}/verify/receipt/${schoolId}/${paymentId}?s=${sign(schoolId, paymentId)}`;

/** True only for an address this server issued, so the ids in it can be trusted without a sign-in. */
export function isReceiptLink(schoolId: string, paymentId: string, signature: string) {
  const expected = sign(schoolId, paymentId);
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

// PDF's built-in fonts have no rupee sign and no Devanagari. Mukta (SIL Open Font License, in assets/fonts) has
// both, so amounts carry the sign and a name written in Hindi prints.
const FONT = (weight: 'Regular' | 'Bold') => path.join(process.cwd(), 'assets', 'fonts', `Mukta-${weight}.ttf`);
const money = (minor: number) =>
  `₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100)}`;
const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

export type ReceiptLabels = Record<
  | 'title' | 'receiptNo' | 'date' | 'student' | 'admissionNo' | 'class' | 'method' | 'reference' | 'collectedBy'
  | 'amount' | 'allocations' | 'invoiceNo' | 'installment' | 'verify' | 'computer',
  string
> & { methodName: string };

/** One A5 page: the school, who paid what and how, what it went towards, and a QR code to check it. */
export async function renderReceiptPdf(receipt: Receipt, schoolId: string, labels: ReceiptLabels) {
  const qr = await QRCode.toBuffer(receiptVerifyUrl(schoolId, receipt.id), { margin: 0, width: 220 });
  const doc = new PDFDocument({ size: 'A5', margin: 36, info: { Title: `${labels.title} ${receipt.receiptNo}` } });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  doc.registerFont('body', FONT('Regular'));
  doc.registerFont('bold', FONT('Bold'));
  const { left, right } = doc.page.margins;
  const width = doc.page.width - left - right;

  doc.font('bold').fontSize(15).text(receipt.schoolName, { align: 'center' });
  doc.moveDown(0.2).font('body').fontSize(11).text(labels.title, { align: 'center' });
  doc.moveDown(0.8);

  const pairs: [string, string][] = [
    [labels.receiptNo, receipt.receiptNo],
    [labels.date, dateTime.format(new Date(receipt.collectedAt))],
    [labels.student, receipt.studentName],
    [labels.admissionNo, receipt.admissionNo],
    [labels.class, receipt.classSection ?? '-'],
    [labels.method, labels.methodName],
    ...(receipt.reference ? [[labels.reference, receipt.reference] as [string, string]] : []),
    [labels.collectedBy, receipt.collectedBy],
  ];
  for (const [label, value] of pairs) {
    const y = doc.y;
    doc.font('body').fontSize(9).fillColor('#555555').text(label, left, y, { width: 110 });
    doc.font('body').fontSize(10).fillColor('#000000').text(value, left + 115, y, { width: width - 115 });
    doc.moveDown(0.35);
  }

  doc.moveDown(0.6).font('bold').fontSize(10).text(labels.allocations, left);
  doc.moveDown(0.3);
  const row = (invoiceNo: string, installment: string, amount: string, bold = false) => {
    const y = doc.y;
    doc.font(bold ? 'bold' : 'body').fontSize(9);
    doc.text(invoiceNo, left, y, { width: 150 });
    doc.text(installment, left + 155, y, { width: width - 255 });
    doc.text(amount, left + width - 95, y, { width: 95, align: 'right' });
    doc.moveDown(0.4);
  };
  row(labels.invoiceNo, labels.installment, labels.amount, true);
  doc.moveTo(left, doc.y).lineTo(left + width, doc.y).strokeColor('#bbbbbb').stroke();
  doc.moveDown(0.3);
  for (const allocation of receipt.allocations) row(allocation.invoiceNo, allocation.installment, money(allocation.amountMinor));
  doc.moveTo(left, doc.y).lineTo(left + width, doc.y).stroke();
  doc.moveDown(0.4);
  row('', labels.amount, money(receipt.amountMinor), true);

  const qrSize = 78;
  const bottom = doc.page.height - doc.page.margins.bottom - qrSize;
  doc.image(qr, left, bottom, { width: qrSize });
  doc.font('body').fontSize(8).fillColor('#555555');
  doc.text(labels.verify, left + qrSize + 10, bottom + 22, { width: width - qrSize - 10 });
  doc.text(labels.computer, left + qrSize + 10, bottom + 46, { width: width - qrSize - 10 });

  doc.end();
  return done;
}
