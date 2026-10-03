import Alert from '@cloudscape-design/components/alert';
import Button from '@cloudscape-design/components/button';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import { getTranslations } from 'next-intl/server';

export default async function NotFound() {
  const t = await getTranslations('states.notFound');
  return (
    <ContentLayout header={<Header variant="h1">{t('title')}</Header>}>
      <Alert type="info" action={<Button href="/">{t('action')}</Button>}>
        {t('body')}
      </Alert>
    </ContentLayout>
  );
}
