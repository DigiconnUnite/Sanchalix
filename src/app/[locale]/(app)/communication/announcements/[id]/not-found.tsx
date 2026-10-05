import Alert from '@cloudscape-design/components/alert';
import Button from '@cloudscape-design/components/button';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import { getTranslations } from 'next-intl/server';

export default async function AnnouncementNotFound() {
  const t = await getTranslations('comms.announcements');
  return (
    <ContentLayout header={<Header variant="h1">{t('notFound.heading')}</Header>}>
      <Alert type="info" action={<Button href="/communication/announcements">{t('back')}</Button>}>
        {t('notFound.body')}
      </Alert>
    </ContentLayout>
  );
}
