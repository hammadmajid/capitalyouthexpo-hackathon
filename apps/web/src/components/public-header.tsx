'use client';
import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { BedDouble, Menu, X } from 'lucide-react';
import { brand } from '../lib/brand';
import { authenticationPath } from '../lib/return-path';
import { MarketplaceButton as Button } from './ui/marketplace-button';
const ownerPath = authenticationPath('login', '/app/owner');
const textLink =
  'inline-flex min-h-12 items-center rounded-input px-3 text-sm font-semibold text-customer-heading hover:bg-customer-aqua';
export function BrandMark() {
  return (
    <Link href="/" className="inline-flex min-h-12 items-center gap-3 rounded-input pr-2">
      <span
        aria-hidden="true"
        className="grid size-10 place-items-center rounded-input bg-customer-primary text-customer-surface"
      >
        <BedDouble size={22} strokeWidth={1.75} />
      </span>
      <span className="grid leading-tight">
        <span className="text-xl font-bold tracking-tight text-customer-heading">{brand.name}</span>
        <span className="text-xs text-customer-secondary">{brand.serviceAreas.join(' · ')}</span>
      </span>
    </Link>
  );
}
export function PublicHeader() {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  return (
    <header className="sticky top-0 z-40 border-b border-customer-border bg-customer-background/90 backdrop-blur">
      <nav
        aria-label="Public navigation"
        className="mx-auto flex max-w-[75rem] items-center justify-between gap-4 px-6 py-2"
      >
        <BrandMark />
        <div className="hidden items-center gap-1 md:flex">
          <Link href={ownerPath} className={textLink}>
            List your hostel
          </Link>
          <Link href="/login" className={textLink}>
            Sign in
          </Link>
          <Button asChild className="ml-2">
            <Link href="/register">Create account</Link>
          </Button>
        </div>
        <Button
          variant="ghost"
          className="px-3 md:hidden"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </Button>
      </nav>
      {open ? <MobileMenu id={menuId} onNavigate={() => setOpen(false)} /> : null}
    </header>
  );
}
function MobileMenu({ id, onNavigate }: { id: string; onNavigate: () => void }) {
  return (
    <div id={id} className="border-t border-customer-border px-6 pb-4 md:hidden">
      <div className="mx-auto grid max-w-[75rem] gap-1 pt-2">
        <Link href={ownerPath} className={textLink} onClick={onNavigate}>
          List your hostel
        </Link>
        <Link href="/login" className={textLink} onClick={onNavigate}>
          Sign in
        </Link>
        <Button asChild className="mt-2">
          <Link href="/register" onClick={onNavigate}>
            Create account
          </Link>
        </Button>
      </div>
    </div>
  );
}
