import Link from 'next/link';
import { BadgeCheck, HandCoins } from 'lucide-react';
import { brand } from '../lib/brand';
import { authenticationPath } from '../lib/return-path';
import { BrandMark } from './public-header';
type FooterLink = { label: string; href: string };
const columns: { title: string; links: FooterLink[] }[] = [
  {
    title: 'For students',
    links: [
      { label: 'Find hostels', href: '/' },
      { label: 'Create account', href: '/register' },
      {
        label: 'Create your Customer profile',
        href: authenticationPath('login', '/app/customer-profile'),
      },
    ],
  },
  {
    title: 'For hostel owners',
    links: [
      { label: 'List your hostel', href: authenticationPath('login', '/app/owner') },
      { label: 'Owner profile', href: authenticationPath('login', '/app/owner-profile') },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Sign in', href: '/login' },
      { label: 'Reset your password', href: '/recover' },
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms and conditions', href: '/terms' },
    ],
  },
];
// BR-01: the platform never holds rent or deposits; say so where every visitor sees it.
const promises = [
  { icon: BadgeCheck, text: 'Hostels appear here only after platform verification.' },
  {
    icon: HandCoins,
    text: 'You pay rent and deposits to the hostel directly. We never hold your money.',
  },
];
export function PublicFooter() {
  return (
    <footer className="mt-12 border-t border-customer-border bg-customer-surface/70">
      <div className="mx-auto grid max-w-[75rem] gap-10 px-6 py-10 lg:grid-cols-[1.4fr_2fr]">
        <div className="grid content-start gap-4">
          <BrandMark />
          <p className="max-w-sm text-sm text-customer-secondary">{brand.promise}</p>
          <ul className="grid gap-3">
            {promises.map(({ icon: Icon, text }) => (
              <li key={text} className="flex gap-3 text-sm text-customer-text">
                <Icon aria-hidden="true" size={20} className="shrink-0 text-customer-primary" />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {columns.map((column) => (
            <div key={column.title}>
              <h2 className="text-sm font-bold text-customer-heading">{column.title}</h2>
              <ul className="mt-2 grid">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="inline-flex min-h-11 items-center text-sm text-customer-secondary hover:text-customer-primary hover:underline"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="border-t border-customer-border">
        <p className="mx-auto max-w-[75rem] px-6 py-4 text-xs text-customer-muted">
          © {new Date().getFullYear()} {brand.name}. Now serving {brand.serviceAreas.join(' and ')}.
        </p>
      </div>
    </footer>
  );
}
