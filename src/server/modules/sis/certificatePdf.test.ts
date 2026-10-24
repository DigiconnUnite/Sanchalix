import { expect, it } from 'vitest';
import { certificateVerifyUrl, isCertificateLink, renderCertificatePdf } from './certificatePdf';
import type { TransferCertificate } from './schemas';

const SCHOOL = 'a'.repeat(24);
const STUDENT = 'b'.repeat(24);
const certificate: TransferCertificate = {
  studentId: STUDENT,
  tcNo: 'TC/2026-27/0001',
  schoolName: 'Green Valley School',
  schoolAddress: '12 School Road, Bhopal',
  affiliationNo: '1030123',
  name: 'आरव शर्मा',
  admissionNo: 'ADM-1',
  dob: '2014-05-15',
  gender: 'male',
  guardians: 'Sunita Sharma',
  classSection: '7-A',
  academicYear: '2026–27',
  leftOn: '2026-10-10',
  reason: 'Moved to another city',
  duesCleared: true,
};

it('accepts only the verification link it issued for that school and student', () => {
  const url = new URL(certificateVerifyUrl(SCHOOL, STUDENT));
  const signature = url.searchParams.get('s') ?? '';
  expect(url.pathname).toBe(`/verify/tc/${SCHOOL}/${STUDENT}`);
  expect(isCertificateLink(SCHOOL, STUDENT, signature)).toBe(true);
  expect(isCertificateLink(SCHOOL, 'c'.repeat(24), signature)).toBe(false);
  expect(isCertificateLink('d'.repeat(24), STUDENT, signature)).toBe(false);
  expect(isCertificateLink(SCHOOL, STUDENT, '')).toBe(false);
});

it('renders a certificate as a PDF, with Hindi text', async () => {
  const label = new Proxy({}, { get: (_target, key) => String(key) }) as Parameters<typeof renderCertificatePdf>[2];
  const pdf = await renderCertificatePdf(certificate, SCHOOL, label);
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  expect(pdf.length).toBeGreaterThan(5000);
});
