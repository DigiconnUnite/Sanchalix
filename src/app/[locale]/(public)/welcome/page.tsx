import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import Icon from '@cloudscape-design/components/icon';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { getTranslations } from 'next-intl/server';
import { type IconKey, svg } from '@/components/icons';
import { getEntry, PublicPage } from '@/features/marketing/PublicPage';

export async function generateMetadata() {
  const t = await getTranslations('marketing');
  // The tagline already carries the product name, so the usual "· Sanchalix" suffix is left off.
  return { title: { absolute: t('tagline') }, description: t('hero.body') };
}

const FEATURES: { key: string; icon: IconKey }[] = [
  { key: 'students', icon: 'students' },
  { key: 'attendance', icon: 'attendance' },
  { key: 'fees', icon: 'fees' },
  { key: 'exams', icon: 'exams' },
  { key: 'timetable', icon: 'timetable' },
  { key: 'communication', icon: 'announcements' },
];
const ROLES: { key: string; icon: IconKey }[] = [
  { key: 'office', icon: 'school' },
  { key: 'teachers', icon: 'academics' },
  { key: 'accounts', icon: 'collectPayment' },
  { key: 'families', icon: 'guardians' },
];
const STEPS = ['setup', 'run', 'share'];

export default async function WelcomePage() {
  const [t, enter] = await Promise.all([getTranslations('marketing'), getEntry()]);

  return (
    <PublicPage home>
      <ContentLayout
        defaultPadding
        disableOverlap
        maxContentWidth={1040}
        headerVariant="high-contrast"
        header={
          <Box padding={{ vertical: 'xxl' }}>
            <SpaceBetween size="l">
              <Box variant="awsui-key-label" color="inherit">
                {t('tagline')}
              </Box>
              <Box variant="h1" fontSize="display-l" fontWeight="bold">
                {t('hero.title')}
              </Box>
              <Box variant="p" fontSize="heading-m" color="inherit">
                {t('hero.body')}
              </Box>
              <SpaceBetween direction="horizontal" size="xs">
                <Button variant="primary" href={enter.href} iconSvg={svg('signIn')}>
                  {enter.text}
                </Button>
                <Button href="#features">{t('hero.seeFeatures')}</Button>
              </SpaceBetween>
            </SpaceBetween>
          </Box>
        }
      >
        <Box padding={{ vertical: 'xl' }}>
          <SpaceBetween size="xxl">
            <section id="features" aria-labelledby="features-heading">
              <SpaceBetween size="l">
                <Header variant="h2" description={t('features.description')}>
                  <span id="features-heading">{t('features.title')}</span>
                </Header>
                <ColumnLayout columns={3} minColumnWidth={260}>
                  {FEATURES.map(({ key, icon }) => (
                    <Container key={key} fitHeight>
                      <SpaceBetween size="xs">
                        <Icon size="big" svg={svg(icon)} />
                        <Box variant="h3">{t(`features.items.${key}.title`)}</Box>
                        <Box color="text-body-secondary">{t(`features.items.${key}.body`)}</Box>
                      </SpaceBetween>
                    </Container>
                  ))}
                </ColumnLayout>
              </SpaceBetween>
            </section>

            <section id="roles" aria-labelledby="roles-heading">
              <SpaceBetween size="l">
                <Header variant="h2" description={t('roles.description')}>
                  <span id="roles-heading">{t('roles.title')}</span>
                </Header>
                <ColumnLayout columns={4} minColumnWidth={220}>
                  {ROLES.map(({ key, icon }) => (
                    <Container key={key} fitHeight>
                      <SpaceBetween size="xs">
                        <Icon size="medium" svg={svg(icon)} />
                        <Box variant="h3">{t(`roles.items.${key}.title`)}</Box>
                        <Box color="text-body-secondary">{t(`roles.items.${key}.body`)}</Box>
                      </SpaceBetween>
                    </Container>
                  ))}
                </ColumnLayout>
              </SpaceBetween>
            </section>

            <section id="steps" aria-labelledby="steps-heading">
              <Container
                header={
                  <Header variant="h2">
                    <span id="steps-heading">{t('steps.title')}</span>
                  </Header>
                }
              >
                <ColumnLayout columns={3} variant="text-grid" minColumnWidth={220}>
                  {STEPS.map((key, index) => (
                    <div key={key}>
                      <Box variant="awsui-key-label">{t('steps.step', { number: index + 1 })}</Box>
                      <Box variant="h3">{t(`steps.items.${key}.title`)}</Box>
                      <Box color="text-body-secondary">{t(`steps.items.${key}.body`)}</Box>
                    </div>
                  ))}
                </ColumnLayout>
              </Container>
            </section>

            <Container>
              <SpaceBetween size="m" alignItems="center">
                <Box variant="h2" textAlign="center">
                  {t('cta.title')}
                </Box>
                <Box color="text-body-secondary" textAlign="center">
                  {t('cta.body')}
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
