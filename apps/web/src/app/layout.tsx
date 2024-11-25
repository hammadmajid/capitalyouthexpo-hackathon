import 'maplibre-gl/dist/maplibre-gl.css';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import '@fontsource-variable/plus-jakarta-sans';
import '@hsm/ui/tokens.css';
import './globals.css';
import { Providers } from '../components/providers';
export const metadata: Metadata = {
  title: 'HSM · Your space in the Twin Cities',
  description: 'One account for your hostel journey and the spaces you manage.',
};
export default async function RootLayout({ children }: { children: ReactNode }) {
  await headers();
  return (
    <html lang="en">
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-input focus:bg-hsm-surface focus:p-4"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
