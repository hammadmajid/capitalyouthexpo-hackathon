import Link from 'next/link';
import { authenticationPath } from '../../lib/return-path';
import type { ReactNode } from 'react';
import { AuthFrame } from './frame';
export function FlowPage({
  title,
  description,
  children,
  returnPath,
}: {
  title: string;
  description: string;
  children: ReactNode;
  returnPath?: string | undefined;
}) {
  return (
    <AuthFrame>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold text-hsm-heading">{title}</h2>
          <p className="mt-3 text-sm text-hsm-secondary">{description}</p>
        </div>
        {children}
        <Link className="text-link block text-sm" href={authenticationPath('login', returnPath)}>
          Back to sign in
        </Link>
      </div>
    </AuthFrame>
  );
}
