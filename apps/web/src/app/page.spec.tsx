import { expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import Home from './page';
import { Providers } from '../components/providers';
// ACC-002 (2026-11-11) made the home search-first: no hero or university section.
it('CHG-006: the public marketplace shell renders supported service areas without requiring authentication or inventing listings', () => {
  const html = renderToString(
    <Providers>
      <Home />
    </Providers>,
  );
  expect(html).toContain('Find hostels');
  expect(html).toContain('Islamabad');
  expect(html).toContain('Rawalpindi');
  expect(html).toContain('Public navigation');
  expect(html).toContain('href="/login"');
  expect(html).toContain('href="/register"');
  expect(html).toContain('aria-label="Loading hostels"');
  expect(html).toContain('Featured Hostels');
  const document = new DOMParser().parseFromString(html, 'text/html');
  // Currency labels are valid filter inputs; fabricated listing prices/cards are not.
  expect(document.querySelectorAll('article')).toHaveLength(0);
  expect(document.body.textContent).not.toMatch(/PKR\s+[0-9]/);
  expect(html).toContain('Minimum monthly rent (PKR)');
  expect(html).not.toContain('Available seats');
  expect(html).toContain('returnTo=%2Fapp%2Fcustomer-profile');
  expect(html).toContain('returnTo=%2Fapp%2Fowner');
});
