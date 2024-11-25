import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { PublicHeader } from './public-header';
import { PublicFooter } from './public-footer';
import { authenticationPath } from '../lib/return-path';
afterEach(cleanup);
const hrefs = (scope: HTMLElement) =>
  within(scope)
    .getAllByRole('link')
    .map((link) => link.getAttribute('href'));
it('CHG-006: public header offers guest entry points with validated return paths', () => {
  render(<PublicHeader />);
  const nav = screen.getByRole('navigation', { name: 'Public navigation' });
  expect(within(nav).getByRole('link', { name: /HSM/ }).getAttribute('href')).toBe('/');
  expect(within(nav).getByText('Islamabad · Rawalpindi')).toBeDefined();
  expect(hrefs(nav)).toEqual(
    expect.arrayContaining(['/login', '/register', '/login?returnTo=%2Fapp%2Fowner']),
  );
});
it('SCOPE-002: mobile menu toggles with an accessible state and closes on Escape', () => {
  render(<PublicHeader />);
  const toggle = screen.getByRole('button', { name: 'Open menu' });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(toggle);
  const opened = screen.getByRole('button', { name: 'Close menu' });
  expect(opened.getAttribute('aria-expanded')).toBe('true');
  const menu = document.getElementById(opened.getAttribute('aria-controls') ?? '');
  expect(menu).not.toBeNull();
  expect(hrefs(menu as HTMLElement)).toEqual(
    expect.arrayContaining(['/login', '/register', '/login?returnTo=%2Fapp%2Fowner']),
  );
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.getByRole('button', { name: 'Open menu' })).toBeDefined();
  expect(document.getElementById(opened.getAttribute('aria-controls') ?? '')).toBeNull();
});
it('BR-01: public footer states direct payment and links only implemented routes', () => {
  render(<PublicFooter />);
  expect(screen.getByText(/We never hold your money/)).toBeDefined();
  expect(screen.getByText(/Now serving Islamabad and Rawalpindi/)).toBeDefined();
  const nav = screen.getByRole('navigation', { name: 'Footer' });
  expect(hrefs(nav)).toEqual([
    '/',
    '/register',
    authenticationPath('login', '/app/customer-profile'),
    authenticationPath('login', '/app/owner'),
    authenticationPath('login', '/app/owner-profile'),
    '/login',
    '/recover',
    '/privacy',
    '/terms',
  ]);
  expect(authenticationPath('login', '/app/owner')).toBe('/login?returnTo=%2Fapp%2Fowner');
});
