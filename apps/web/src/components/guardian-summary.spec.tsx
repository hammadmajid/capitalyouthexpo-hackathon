import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GuardianSummary } from './guardian-summary';
import { summary } from '../../test/unit/public-summary.fixture';
it('p.14 / SEC-003: guardian HTML contains real prices/deposits/rules before JavaScript and escapes public text', () => {
  const html = renderToStaticMarkup(<GuardianSummary summary={summary} />);
  expect(html).toContain('Public branch');
  expect(html).toContain('PKR 18,000.01');
  expect(html).toContain('PKR 5,000');
  expect(html).toContain('Published house rule');
  expect(html).toContain('Wi-Fi');
  expect(html).toContain('&lt;script&gt;Public description&lt;/script&gt;');
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('availableBeds');
  expect(html).not.toContain('Loading');
});
