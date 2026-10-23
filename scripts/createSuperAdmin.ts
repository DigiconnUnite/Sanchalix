import mongoose from 'mongoose';
import { z } from 'zod';
import { hashPassword } from '@/server/auth/service';
import { connectDb } from '@/server/db/connect';
import { User } from '@/server/models/user';
import { temporaryPassword } from '@/server/modules/users/service';

const [email, name] = process.argv.slice(2);
const parsed = z.object({ email: z.email(), name: z.string().trim().min(2) }).safeParse({ email: email?.toLowerCase(), name });
if (!parsed.success) {
  console.error('Usage: npm run superadmin -- name@example.com "Full name"');
  process.exit(1);
}
const admin = parsed.data;

async function main() {
  await connectDb();
  if (await User.exists({ email: admin.email })) throw new Error('That email address already has a sign-in.');
  const password = temporaryPassword();
  await User.create({
    name: admin.name,
    email: admin.email,
    passwordHash: await hashPassword(password),
    roles: [{ role: 'super_admin', scope: 'platform' }],
    status: 'active',
  });
  console.log(`Platform admin created: ${admin.email}`);
  console.log(`Temporary password (shown once): ${password}`);
  console.log('Two-step verification is set up at first sign-in once TWO_FACTOR_ENABLED=true.');
  await mongoose.disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
