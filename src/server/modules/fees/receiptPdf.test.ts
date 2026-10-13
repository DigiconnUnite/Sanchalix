import { expect, it } from 'vitest';
import { tableResponse } from '@/server/csv';
import { isReceiptLink, receiptVerifyUrl, renderReceiptPdf } from './receiptPdf';
import type { Receipt } from './schemas';

const SCHOOL = 'a'.repeat(24);
const PAYMENT = 'b'.repeat(24);
const receipt: Receipt = {
  id: PAYMENT,
  studentId: 'c'.repeat(24),
  receiptNo: 'RCPT/2026-27/000001',
  collectedAt: '2026-10-10T05:00:00.000Z',
  collectedBy: 'Ramesh Gupta',
  studentName: 'आरव शर्मा',
  admissionNo: 'ADM-1',
  classSection: '7-A',
  schoolName: 'Green Valley School',
  method: 'cash',
  reference: null,
  bankName: null,
  note: null,
  amountMinor: 1_250_000,
  allocations: [{ invoiceNo: 'INV/2026-27/000001', installment: 'Q1', amountMinor: 1_250_000 }],
};

it('accepts only the verification link it issued for that school and payment', () => {
  const url = new URL(receiptVerifyUrl(SCHOOL, PAYMENT));
  const signature = url.searchParams.get('s') ?? '';
  expect(url.pathname).toBe(`/verify/receipt/${SCHOOL}/${PAYMENT}`);
  expect(isReceiptLink(SCHOOL, PAYMENT, signature)).toBe(true);
  expect(isReceiptLink(SCHOOL, 'c'.repeat(24), signature)).toBe(false);
  expect(isReceiptLink('d'.repeat(24), PAYMENT, signature)).toBe(false);
  expect(isReceiptLink(SCHOOL, PAYMENT, `${signature.slice(0, -1)}_`)).toBe(false);
  expect(isReceiptLink(SCHOOL, PAYMENT, '')).toBe(false);
});

it('renders a receipt as a PDF', async () => {
  const label = new Proxy({}, { get: (_target, key) => String(key) }) as Parameters<typeof renderReceiptPdf>[2];
  const pdf = await renderReceiptPdf(receipt, SCHOOL, label);
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(2000);
});

it('writes a table as CSV with formulas disarmed, or as an Excel workbook', async () => {
  const rows = [
    ['Name', 'Amount'],
    ['=SUM(A1)', 125],
  ];
  const csv = await tableResponse('csv', 'students', rows);
  expect(await csv.text()).toContain("'=SUM(A1),125");
  expect(csv.headers.get('Content-Disposition')).toContain('students.csv');

  const xlsx = await tableResponse('xlsx', 'students', rows);
  expect(xlsx.headers.get('Content-Disposition')).toContain('students.xlsx');
  // A workbook is a zip file, which starts with "PK".
  expect(Buffer.from(await xlsx.arrayBuffer()).subarray(0, 2).toString()).toBe('PK');
});
