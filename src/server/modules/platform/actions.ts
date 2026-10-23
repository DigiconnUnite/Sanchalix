'use server';

import 'server-only';
import { Types } from 'mongoose';
import { getTranslations } from 'next-intl/server';
import { withAction } from '@/server/action';
import { requirePlatform } from '@/server/auth/context';
import { requestPasswordReset } from '@/server/auth/recovery';
import { platformAudit } from '@/server/platform/audit';
import { AdminId, createSchool as create, resetAdminPassword as reset, SchoolInput, SchoolStatusInput, setSchoolStatus as setStatus } from './service';

export async function createSchool(input: unknown) {
  return withAction('platform.school.create', async () => {
    const ctx = await requirePlatform('platform.school.create');
    const data = SchoolInput.parse(input);
    const school = await create(data);
    await platformAudit(ctx.userId, 'platform.school.create', { type: 'school', id: school.id }, {
      targetSchoolId: school.id,
      after: { name: data.name, code: data.code, board: data.board, plan: data.plan, admin: data.admin.email },
    });
    // The first admin also gets a link to choose their own password, so the temporary one needn't be passed on.
    const t = await getTranslations('outbound.invite');
    await requestPasswordReset(
      school.adminEmail,
      (link) => ({ subject: t('subject'), body: t('body', { name: school.adminName, link }) }),
      'invite',
    );
    return { id: String(school.id), name: school.name, adminEmail: school.adminEmail, password: school.password };
  });
}

export async function setSchoolStatus(input: unknown) {
  return withAction('platform.school.update', async () => {
    const ctx = await requirePlatform('platform.school.update');
    const data = SchoolStatusInput.parse(input);
    const school = await setStatus(data);
    await platformAudit(ctx.userId, `platform.school.${data.status === 'suspended' ? 'suspend' : 'activate'}`, { type: 'school', id: school.id }, {
      targetSchoolId: school.id,
      before: { status: school.before },
      after: { status: data.status },
      ...(data.reason && { reason: data.reason }),
    });
    return { name: school.name, status: data.status };
  });
}

export async function resetSchoolAdminPassword(input: unknown) {
  return withAction('platform.school.update', async () => {
    const ctx = await requirePlatform('platform.school.update');
    const { schoolId, userId } = AdminId.parse(input);
    const admin = await reset(schoolId, userId);
    await platformAudit(ctx.userId, 'platform.admin.resetPassword', { type: 'user', id: admin.id }, {
      targetSchoolId: new Types.ObjectId(schoolId),
    });
    return { name: admin.name, password: admin.password };
  });
}
