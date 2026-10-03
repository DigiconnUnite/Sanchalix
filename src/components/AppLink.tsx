'use client';

import Link, { type LinkProps } from '@cloudscape-design/components/link';
import { useRouter } from '@/i18n/navigation';

export function AppLink({ href, ...props }: LinkProps & { href: string }) {
  const router = useRouter();
  return (
    <Link
      {...props}
      href={href}
      onFollow={(event) => {
        event.preventDefault();
        router.push(href);
      }}
    />
  );
}
