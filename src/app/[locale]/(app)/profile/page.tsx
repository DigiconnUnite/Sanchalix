import { getTranslations } from 'next-intl/server';
import { ProfileView } from '@/features/auth/ProfileView';
import { parseDensity } from '@/lib/visualMode';
import { readSession } from '@/server/auth/session';
import { Guardian } from '@/server/models/guardian';
import { Session } from '@/server/models/session';
import { User } from '@/server/models/user';
import { pageContext } from '../pageContext';

// ponytail: names the common browsers and systems only; use a user-agent parser if staff need more than that.
function deviceName(userAgent?: string | null) {
  if (!userAgent) return null;
  const browser = /Edg\//.test(userAgent) ? 'Edge' : (/(Firefox|Chrome|Safari)/.exec(userAgent)?.[1] ?? null);
  const system =
    /(Android|iPhone|iPad|Windows|Mac OS X|Linux)/.exec(userAgent)?.[1]?.replace('Mac OS X', 'macOS') ?? null;
  return [browser, system].filter(Boolean).join(' · ') || null;
}

export async function generateMetadata() {
  const t = await getTranslations('auth.profile');
  return { title: t('title') };
}

export default async function ProfilePage() {
  const ctx = await pageContext();
  const [t, user, sessions, current, guardian] = await Promise.all([
    getTranslations('shell.roles'),
    User.findById(ctx.userId).select('email phone density notificationPrefs').lean(),
    Session.find({ userId: ctx.userId, totpPending: { $ne: true }, expires: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .select('userAgent ip createdAt')
      .lean(),
    readSession(),
    ctx.guardianId
      ? Guardian.findOne({ schoolId: ctx.schoolId, _id: ctx.guardianId }).select('notificationPrefs').lean()
      : null,
  ]);
  return (
    <ProfileView
      name={ctx.name}
      roleLabel={t(ctx.role)}
      email={user?.email ?? null}
      density={parseDensity(user?.density ?? undefined)}
      feeTexts={
        guardian
          ? !guardian.notificationPrefs.some((pref) => pref.channel === 'sms' && pref.category === 'fees' && !pref.enabled)
          : null
      }
      announcementCopy={(['email', 'sms'] as const).map((channel) => ({
        channel,
        reachable: Boolean(channel === 'email' ? user?.email : user?.phone),
        enabled: !user?.notificationPrefs.some((pref) => pref.channel === channel && pref.category === 'announcements' && !pref.enabled),
      }))}
      sessions={sessions.map((session) => ({
        id: String(session._id),
        device: deviceName(session.userAgent),
        ip: session.ip ?? null,
        signedInAt: session.createdAt.toISOString(),
        current: session._id.equals(current?._id),
      }))}
    />
  );
}
