import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { UsersTable } from '@/features/users/Users';
import type { RequestContext } from '@/server/auth/context';
import { can } from '@/server/auth/permissions';
import { ListUsers, listUsers } from '@/server/modules/users/service';
import { pageContext } from '../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('users');
  return { title: t('title') };
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await pageContext('users.user.read');
  const query = ListUsers.parse(await searchParams);
  const canEdit = can(ctx.role, 'users.user.update');
  return (
    <Suspense key={JSON.stringify(query)} fallback={<UsersTable canEdit={canEdit} data={null} />}>
      <UsersList ctx={ctx} query={query} canEdit={canEdit} />
    </Suspense>
  );
}

async function UsersList({ ctx, query, canEdit }: { ctx: RequestContext; query: ListUsers; canEdit: boolean }) {
  return <UsersTable canEdit={canEdit} data={await listUsers(ctx, query)} />;
}
