import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import Link from '@cloudscape-design/components/link';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getEntry, PublicPage } from '@/features/marketing/PublicPage';
import { postDate, POSTS, type PostSection } from '@/features/marketing/posts';

type Props = { params: Promise<{ slug: string }> };

const find = (slug: string) => POSTS.find((post) => post.slug === slug);

export async function generateMetadata({ params }: Props) {
  const post = find((await params).slug);
  if (!post) return {};
  const t = await getTranslations('marketing.blog.posts');
  return { title: t(`${post.slug}.title`), description: t(`${post.slug}.summary`) };
}

export default async function BlogPostPage({ params }: Props) {
  const post = find((await params).slug);
  if (!post) notFound();
  const [t, tMarketing, enter] = await Promise.all([
    getTranslations('marketing.blog'),
    getTranslations('marketing'),
    getEntry(),
  ]);
  const sections = t.raw(`posts.${post.slug}.sections`) as PostSection[];
  const others = POSTS.filter(({ slug }) => slug !== post.slug).slice(0, 3);

  return (
    <PublicPage>
      <ContentLayout
        defaultPadding
        disableOverlap
        maxContentWidth={760}
        headerVariant="high-contrast"
        header={
          <Box padding={{ vertical: 'xl' }}>
            <SpaceBetween size="s">
              <Link href="/blog" color="inverted">
                {t('back')}
              </Link>
              <Box variant="awsui-key-label" color="inherit">
                {t(`topics.${post.topic}`)}
              </Box>
              <Box variant="h1" fontSize="display-l" fontWeight="bold">
                {t(`posts.${post.slug}.title`)}
              </Box>
              <Box variant="p" fontSize="heading-m" color="inherit">
                {t(`posts.${post.slug}.summary`)}
              </Box>
              <Box color="inherit" fontSize="body-s">
                {t('meta', { date: postDate(post.date), minutes: post.minutes })}
              </Box>
            </SpaceBetween>
          </Box>
        }
      >
        <Box padding={{ vertical: 'xl' }}>
          <SpaceBetween size="xxl">
            <article>
              <SpaceBetween size="xl">
                {sections.map(({ heading, paragraphs }) => (
                  <section key={heading}>
                    <SpaceBetween size="s">
                      <Box variant="h2">{heading}</Box>
                      {paragraphs.map((paragraph) => (
                        <Box key={paragraph} variant="p" fontSize="heading-s" fontWeight="normal">
                          {paragraph}
                        </Box>
                      ))}
                    </SpaceBetween>
                  </section>
                ))}
              </SpaceBetween>
            </article>

            <Container header={<Header variant="h2">{t('more')}</Header>}>
              <SpaceBetween size="m">
                {others.map(({ slug, date, minutes }) => (
                  <div key={slug}>
                    <Link href={`/blog/${slug}`} fontSize="heading-s">
                      {t(`posts.${slug}.title`)}
                    </Link>
                    <Box color="text-body-secondary" fontSize="body-s">
                      {t('meta', { date: postDate(date), minutes })}
                    </Box>
                  </div>
                ))}
              </SpaceBetween>
            </Container>

            <Container>
              <SpaceBetween size="m" alignItems="center">
                <Box variant="h2" textAlign="center">
                  {tMarketing('cta.title')}
                </Box>
                <Box color="text-body-secondary" textAlign="center">
                  {tMarketing('cta.body')}
                </Box>
                <Button variant="primary" href={enter.href}>
                  {enter.text}
                </Button>
              </SpaceBetween>
            </Container>
          </SpaceBetween>
        </Box>
      </ContentLayout>
    </PublicPage>
  );
}
