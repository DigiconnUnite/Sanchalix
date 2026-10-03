import 'server-only';
import pino from 'pino';

const SENSITIVE = [
  'password',
  'passwordHash',
  'otp',
  'token',
  'sessionToken',
  'cookie',
  'aadhaarNo',
  'medical',
  'bank',
  'pan',
  'phone',
  'email',
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: { paths: SENSITIVE.flatMap((key) => [key, `*.${key}`]), censor: '[redacted]' },
});
