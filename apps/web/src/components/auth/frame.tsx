import Link from 'next/link';
import { ArrowUpRight, Building2, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main
      id="main"
      className="mx-auto grid min-h-screen max-w-7xl items-center gap-12 px-6 py-10 lg:grid-cols-2 lg:px-12"
    >
      <section className="space-y-8" aria-label="Welcome to HSM">
        <Link
          href="/"
          className="inline-flex items-center gap-3 text-xl font-bold text-hsm-heading"
          aria-label="HSM home"
        >
          <span className="rounded-card bg-hsm-primary p-3 text-hsm-surface">
            <Building2 strokeWidth={1.75} aria-hidden="true" />
          </span>
          HSM
        </Link>
        <div className="hidden space-y-5 lg:block">
          <p className="text-sm font-semibold uppercase tracking-widest text-hsm-primary">
            Islamabad · Rawalpindi
          </p>
          <h1 className="max-w-lg text-4xl font-bold leading-tight tracking-tight text-hsm-heading sm:text-5xl">
            A place to belong.
            <br />A simpler way to manage.
          </h1>
          <p className="max-w-md text-base leading-relaxed">
            One account for your hostel journey and the spaces you manage.
          </p>
        </div>
        <div className="hidden max-w-md rounded-panel border border-hsm-border bg-hsm-surface p-6 lg:block">
          <ShieldCheck className="mb-3 text-hsm-primary" strokeWidth={1.75} aria-hidden="true" />
          <h2 className="font-semibold text-hsm-heading">Your access, connected</h2>
          <p className="mt-2 text-sm leading-relaxed">
            Switch between your available spaces after signing in. Your account permissions stay in
            sync.
          </p>
          <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-hsm-primary">
            Built around trust <ArrowUpRight size={16} aria-hidden="true" />
          </span>
        </div>
      </section>
      <section
        className="rounded-panel border border-hsm-border bg-hsm-surface p-6 shadow-sm sm:p-10"
        aria-label="Account access"
      >
        {children}
      </section>
    </main>
  );
}
