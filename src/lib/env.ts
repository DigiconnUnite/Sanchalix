import { z } from 'zod';

const Env = z.object({
  APP_URL: z.url(),
  MONGODB_URI: z.string().startsWith('mongodb'),
  AUTH_SECRET: z.string().min(32),
  TWO_FACTOR_ENABLED: z.enum(['true', 'false']).default('false'),
});

export const env = Env.parse(process.env);
