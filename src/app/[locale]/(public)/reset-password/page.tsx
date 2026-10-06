import Box from '@cloudscape-design/components/box';
import { getTranslations } from 'next-intl/server';
import { ResetPasswordForm } from '@/features/auth/Recovery';

export async function generateMetadata() {
  const t = await getTranslations('auth.reset');
  return { title: t('resetTitle') };
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await searchParams;
  return (
    <div className="vw-auth-page">
      <Box padding={{ vertical: 'xxxl', horizontal: 'l' }}>
        <div className="vw-auth-card">
          <ResetPasswordForm token={typeof token === 'string' ? token : ''} />
        </div>
      </Box>
    </div>
  );
}
