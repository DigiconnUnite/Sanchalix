import Box from '@cloudscape-design/components/box';
import { getTranslations } from 'next-intl/server';
import { ForgotPasswordForm } from '@/features/auth/Recovery';

export async function generateMetadata() {
  const t = await getTranslations('auth.reset');
  return { title: t('forgotTitle') };
}

export default function ForgotPasswordPage() {
  return (
    <div className="vw-auth-page">
      <Box padding={{ vertical: 'xxxl', horizontal: 'l' }}>
        <div className="vw-auth-card">
          <ForgotPasswordForm />
        </div>
      </Box>
    </div>
  );
}
