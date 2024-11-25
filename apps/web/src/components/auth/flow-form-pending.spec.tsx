import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { FlowForm } from './flow-form';
vi.mock('react-hook-form', () => ({
  useForm: () => ({
    formState: { isSubmitting: true },
    handleSubmit: () => () => undefined,
  }),
}));
it('AUTH-C: pending form renders readable waiting text, busy state and disabled submission', () => {
  const html = renderToString(<FlowForm fields={[]} label="Save" submit={async () => undefined} />);
  expect(html).toContain('Please wait…');
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain('disabled=""');
  expect(html).not.toContain('>Save<');
});
