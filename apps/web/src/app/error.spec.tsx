import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToStaticMarkup } from 'react-dom/server';
import ErrorPage from './error';
import GlobalError from './global-error';
afterEach(cleanup);
it('SEC-003: the page error boundary hides private exceptions and preserves retry', async () => {
  const privateValue = 'PRIVATE-password-otp-refresh-cnic-phone-proof';
  const reset = vi.fn();
  render(<ErrorPage error={new Error(privateValue)} reset={reset} />);
  expect(screen.getByRole('heading', { name: 'Something interrupted your visit' })).toBeDefined();
  expect(document.body.textContent).not.toContain(privateValue);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
  expect(reset).toHaveBeenCalledOnce();
});
it('SEC-003: root-layout fallback contains its document and no private error data', () => {
  const privateValue = 'PRIVATE-password-otp-refresh-cnic-phone-proof';
  const html = renderToStaticMarkup(
    <GlobalError error={new Error(privateValue)} reset={() => undefined} />,
  );
  expect(html).toContain('<html lang="en">');
  expect(html).toContain('Something interrupted your visit');
  expect(html).toContain('Try again');
  expect(html).not.toContain(privateValue);
});
