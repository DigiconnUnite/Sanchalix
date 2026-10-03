import Alert from '@cloudscape-design/components/alert';
import Button from '@cloudscape-design/components/button';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import { getTranslations } from 'next-intl/server';

export default async function StudentNotFound() {
  const t = await getTranslations('sis.students.profile.notFound');
  return (
    <ContentLayout header={<Header variant="h1">{t('heading')}</Header>}>
      <Alert type="info" action={<Button href="/students">{t('action')}</Button>}>
        {t('body')}
      </Alert>
    </ContentLayout>
  );
}
