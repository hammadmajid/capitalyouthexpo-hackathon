import type { ReactNode } from 'react';
import { PublicFooter } from './public-footer';
import { PublicHeader } from './public-header';
// Plain public text pages (privacy, terms) share the public header and footer.
export function PublicPolicyPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-hsm-background text-hsm-heading">
      <PublicHeader />
      <main id="main" className="mx-auto max-w-2xl space-y-4 px-4 py-10">
        <h1 className="text-3xl font-bold">{title}</h1>
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
