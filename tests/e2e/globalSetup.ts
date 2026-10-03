import { execSync } from 'node:child_process';

// Every run starts from the same data, because the 2FA setup journey can only be done once per account.
export default function setup() {
  execSync('npm run seed', { stdio: 'inherit' });
}
