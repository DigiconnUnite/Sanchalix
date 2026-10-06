import Box from '@cloudscape-design/components/box';
import { getLocale, getTranslations } from 'next-intl/server';
import { OtpSignInForm } from '@/features/auth/Recovery';
import { redirect } from '@/i18n/navigation';
import { safeNext } from '@/lib/safeNext';
import { getContext } from '@/server/auth/context';

export async function generateMetadata() {
  const t = await getTranslations('auth.otp');
  return { title: t('title') };
}

export default async function OtpSignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = safeNext((await searchParams).next);
  if (await getContext()) redirect({ href: next, locale: await getLocale() });
  return (
    <Box padding={{ vertical: 'xxxl', horizontal: 'l' }}>
      <div className="vw-auth-card">
        <OtpSignInForm next={next} />
      </div>
    </Box>
  );
}
