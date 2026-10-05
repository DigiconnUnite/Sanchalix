import { getTranslations } from 'next-intl/server';
import { SectionsTable } from '@/features/academics/SectionsTable';
import { can } from '@/server/auth/permissions';
import { listSections } from '@/server/modules/academics/queries';
import { listTeachers } from '@/server/modules/hr/service';
import { pageContext } from '../../pageContext';

export async function generateMetadata() {
  const t = await getTranslations('academics.classes');
  return { title: t('title') };
}

export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await pageContext('academics.class.read');
  const { created } = await searchParams;
  return (
    <SectionsTable
      sections={await listSections(ctx)}
      teachers={await listTeachers(ctx)}
      canCreate={can(ctx.role, 'academics.class.create')}
      created={typeof created === 'string' ? created.slice(0, 60) : null}
    />
  );
}
