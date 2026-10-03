import 'server-only';
import { randomUUID } from 'node:crypto';
import { unstable_rethrow } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ZodError } from 'zod';
import { type ActionResult, AppError } from '@/lib/appError';
import { logger } from './logger';

export async function withAction<T>(action: string, run: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (error) {
    unstable_rethrow(error);
    const t = await getTranslations();
    const requestId = `req_${randomUUID().slice(0, 8)}`;

    if (error instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of error.issues) fieldErrors[issue.path.join('.')] ??= t(issue.message);
      const message = t('errors.validation', { count: Object.keys(fieldErrors).length });
      return { ok: false, error: { code: 'VALIDATION', message, fieldErrors, requestId } };
    }
    if (error instanceof AppError) {
      return { ok: false, error: { code: error.code, message: t(error.messageKey, error.details), requestId } };
    }

    // 11000 is MongoDB's duplicate-key error: a unique index caught a concurrent write.
    if (error instanceof Error && 'code' in error && error.code === 11000) {
      return { ok: false, error: { code: 'CONFLICT', message: t('errors.conflict'), requestId } };
    }

    logger.error({ requestId, action, err: error }, 'action failed');
    return { ok: false, error: { code: 'INTERNAL', message: t('errors.internal', { requestId }), requestId } };
  }
}
