import Box from '@cloudscape-design/components/box';
import { getLocale, getTranslations } from 'next-intl/server';
import { toDataURL } from 'qrcode';
import { TotpChallengeForm } from '@/features/auth/TotpChallengeForm';
import { TotpSetupWizard } from '@/features/auth/TotpSetupWizard';
import { redirect } from '@/i18n/navigation';
import { safeNext } from '@/lib/safeNext';
import { getContext, getPendingSession, getPlatformContext } from '@/server/auth/context';
import { getTotpSetup } from '@/server/auth/twoFactor';

export async function generateMetadata() {
  const t = await getTranslations('auth.totp');
  return { title: t('challenge.title') };
}

// Re-rendered by Next.js once an action replaces the pending session with a full one, which sends the user on.
export default async function TwoFactorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const pending = await getPendingSession();
  if (!pending) {
    const href = (await getContext()) || (await getPlatformContext()) ? safeNext((await searchParams).next) : '/signin';
    return redirect({ href, locale: await getLocale() });
  }

  const setup = await getTotpSetup(pending.userId);
  return (
    <Box padding={{ vertical: 'xxxl', horizontal: 'l' }}>
      <div className="vw-auth-card vw-auth-card-wide">
        {setup ? (
          <TotpSetupWizard secret={setup.secret} qrCode={await toDataURL(setup.otpauthUrl, { margin: 1, width: 200 })} />
        ) : (
          <TotpChallengeForm />
        )}
      </div>
    </Box>
  );
}
