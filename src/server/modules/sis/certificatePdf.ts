import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { env } from '@/lib/env';
import type { TransferCertificate } from './schemas';

const sign = (schoolId: string, studentId: string) =>
  createHmac('sha256', env.AUTH_SECRET).update(`tc:${schoolId}:${studentId}`).digest('base64url').slice(0, 22);

/** The address printed as a QR code on a transfer certificate, so another school can check the certificate is real. */
export const certificateVerifyUrl = (schoolId: string, studentId: string) =>
  `${env.APP_URL}/verify/tc/${schoolId}/${studentId}?s=${sign(schoolId, studentId)}`;

/** True only for an address this server issued, so the ids in it can be trusted without a sign-in. */
export function isCertificateLink(schoolId: string, studentId: string, signature: string) {
  const expected = sign(schoolId, studentId);
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

const FONT = (weight: 'Regular' | 'Bold') => path.join(process.cwd(), 'assets', 'fonts', `Mukta-${weight}.ttf`);
const date = new Intl.DateTimeFormat('en-IN', { dateStyle: 'long', timeZone: 'UTC' });
const day = (value: string) => date.format(new Date(`${value}T00:00:00Z`));

export type CertificateLabels = Record<
  | 'title' | 'tcNo' | 'issuedOn' | 'affiliationNo' | 'name' | 'admissionNo' | 'guardians' | 'dob' | 'gender' | 'class'
  | 'academicYear' | 'leftOn' | 'dues' | 'reason' | 'preparedBy' | 'classTeacher' | 'principal' | 'verify' | 'genderName'
  | 'duesName',
  string
>;

/** One A4 page: the school, the student's details and when they left, signature lines, and a QR code to check it. */
export async function renderCertificatePdf(certificate: TransferCertificate, schoolId: string, labels: CertificateLabels) {
  const qr = await QRCode.toBuffer(certificateVerifyUrl(schoolId, certificate.studentId), { margin: 0, width: 240 });
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `${labels.title} ${certificate.tcNo}` } });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  doc.registerFont('body', FONT('Regular'));
  doc.registerFont('bold', FONT('Bold'));
  const { left, right } = doc.page.margins;
  const width = doc.page.width - left - right;

  doc.font('bold').fontSize(18).text(certificate.schoolName, { align: 'center' });
  if (certificate.schoolAddress) doc.moveDown(0.2).font('body').fontSize(10).fillColor('#555555').text(certificate.schoolAddress, { align: 'center' });
  doc.fillColor('#000000').moveDown(1).font('bold').fontSize(14).text(labels.title, { align: 'center', underline: true });
  doc.moveDown(1.2);

  const pairs: [string, string][] = [
    [labels.tcNo, certificate.tcNo],
    [labels.issuedOn, day(certificate.leftOn)],
    ...(certificate.affiliationNo ? [[labels.affiliationNo, certificate.affiliationNo] as [string, string]] : []),
    [labels.name, certificate.name],
    [labels.admissionNo, certificate.admissionNo],
    [labels.guardians, certificate.guardians || '-'],
    [labels.dob, day(certificate.dob)],
    [labels.gender, labels.genderName],
    [labels.class, certificate.classSection ?? '-'],
    [labels.academicYear, certificate.academicYear ?? '-'],
    [labels.leftOn, day(certificate.leftOn)],
    [labels.dues, labels.duesName],
    [labels.reason, certificate.reason || '-'],
  ];
  for (const [label, value] of pairs) {
    const y = doc.y;
    doc.font('body').fontSize(10).fillColor('#555555').text(label, left, y, { width: 160 });
    doc.font('body').fontSize(11).fillColor('#000000').text(value, left + 170, y, { width: width - 170 });
    doc.moveDown(0.6);
  }

  const lineY = doc.page.height - doc.page.margins.bottom - 150;
  const slot = width / 3;
  [labels.preparedBy, labels.classTeacher, labels.principal].forEach((label, index) => {
    const x = left + slot * index;
    doc.moveTo(x + 6, lineY).lineTo(x + slot - 18, lineY).strokeColor('#888888').stroke();
    doc.font('body').fontSize(10).fillColor('#555555').text(label, x + 6, lineY + 6, { width: slot - 24 });
  });

  const qrSize = 80;
  const bottom = doc.page.height - doc.page.margins.bottom - qrSize;
  doc.image(qr, left, bottom, { width: qrSize });
  doc.font('body').fontSize(9).fillColor('#555555').text(labels.verify, left + qrSize + 12, bottom + 28, { width: width - qrSize - 12 });

  doc.end();
  return done;
}
