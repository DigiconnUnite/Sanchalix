import { totpCode } from '@/lib/totp';
import { DEMO_TOTP_SECRET } from './demoSecret';

console.log(totpCode(DEMO_TOTP_SECRET));
