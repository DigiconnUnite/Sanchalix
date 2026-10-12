import Box from '@cloudscape-design/components/box';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { getTranslations } from 'next-intl/server';
import { PublicPage } from '@/features/marketing/PublicPage';
import { postDate, POSTS } from '@/features/marketing/posts';

export async function generateMetadata() {
  const t = await getTranslations('marketing.blog');
  return { title: t('title'), description: t('description') };
}

export default async function BlogPage() {
  const t = await getTranslations('marketing.blog');

  return (
    <PublicPage>
      <ContentLayout
        defaultPadding
        disableOverlap
        maxContentWidth={1040}
        headerVariant="high-contrast"
        header={
          <Box padding={{ vertical: 'xl' }}>
            <SpaceBetween size="s">
              <Box variant="h1" fontSize="display-l" fontWeight="bold">
                {t('title')}
              </Box>
              <Box variant="p" fontSize="heading-m" color="inherit">
                {t('description')}
              </Box>
            </SpaceBetween>
          </Box>
        }
      >
        <Box padding={{ vertical: 'xl' }}>
          <ColumnLayout columns={3} minColumnWidth={280}>
            {POSTS.map(({ slug, date, minutes, topic }) => (
              <Container key={slug} fitHeight>
                <SpaceBetween size="xs">
                  <Box variant="awsui-key-label">{t(`topics.${topic}`)}</Box>
                  <Box variant="h2" fontSize="heading-m">
                    <Link href={`/blog/${slug}`} fontSize="heading-m">
                      {t(`posts.${slug}.title`)}
                    </Link>
                  </Box>
                  <Box color="text-body-secondary">{t(`posts.${slug}.summary`)}</Box>
                  <Box color="text-body-secondary" fontSize="body-s">
                    {t('meta', { date: postDate(date), minutes })}
                  </Box>
                </SpaceBetween>
              </Container>
            ))}
          </ColumnLayout>
        </Box>
      </ContentLayout>
    </PublicPage>
  );
}
