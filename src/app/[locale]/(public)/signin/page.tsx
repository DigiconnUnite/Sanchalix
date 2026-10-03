import Box from '@cloudscape-design/components/box';
import Grid from '@cloudscape-design/components/grid';
import { getLocale, getTranslations } from 'next-intl/server';
import { SignInForm } from '@/features/auth/SignInForm';
import { redirect } from '@/i18n/navigation';
import { safeNext } from '@/lib/safeNext';
import { getContext, getPendingSession } from '@/server/auth/context';

export async function generateMetadata() {
  const t = await getTranslations('auth.signIn');
  return { title: t('submit') };
}

// Next.js re-renders this page once the sign-in action has set the session cookie, which is what sends the user on.
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = safeNext((await searchParams).next);
  if (await getContext()) redirect({ href: next, locale: await getLocale() });
  if (await getPendingSession()) {
    redirect({ href: { pathname: '/signin/2fa', query: next === '/' ? {} : { next } }, locale: await getLocale() });
  }

  return (
    <Box padding={{ vertical: 'xxxl', horizontal: 'l' }}>
      <Grid gridDefinition={[{ colspan: { default: 12, xs: 8, s: 6, m: 4 }, offset: { xs: 2, s: 3, m: 4 } }]}>
        <SignInForm />
      </Grid>
    </Box>
  );
}
