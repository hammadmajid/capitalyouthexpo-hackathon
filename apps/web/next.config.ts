import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';
const config: NextConfig = {
  output: 'standalone',
  env: { NEXT_PUBLIC_APP_ENV: process.env.APP_ENV ?? 'development' },
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  poweredByHeader: false,
  reactStrictMode: true,
};
export default config;
