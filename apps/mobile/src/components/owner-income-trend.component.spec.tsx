/// <reference types="jest" />
import { render, screen, fireEvent } from '@testing-library/react-native';
import { OwnerIncomeTrend } from './owner-income-trend';
const points = [
  { month: '2026-06', collectedPaisa: 0 },
  { month: '2026-07', collectedPaisa: 100001 },
  { month: '2026-08', collectedPaisa: 200000 },
];
it('OWN-004: full-size chart selects a month and shows its exact recorded amount', async () => {
  await render(<OwnerIncomeTrend points={points} />);
  expect(screen.getByText('August 2026')).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: 'View July 2026 collection: PKR 1,000.01' }),
  );
  expect(screen.getByText('July 2026')).toBeTruthy();
  expect(screen.getByText('PKR 1,000.01')).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'View July 2026 collection: PKR 1,000.01' }).props
      .accessibilityState.selected,
  ).toBe(true);
});
it('OWN-004: zero months remain selectable and are never replaced with sample income', async () => {
  await render(<OwnerIncomeTrend points={points} />);
  await fireEvent.press(
    screen.getByRole('button', { name: 'View June 2026 collection: PKR 0.00' }),
  );
  expect(screen.getByText('June 2026')).toBeTruthy();
  expect(screen.getByText('PKR 0.00')).toBeTruthy();
});
it('OWN-004: changed chart range falls back to its newest available month', async () => {
  const view = await render(<OwnerIncomeTrend points={points} />);
  await fireEvent.press(
    screen.getByRole('button', { name: 'View July 2026 collection: PKR 1,000.01' }),
  );
  await view.rerender(<OwnerIncomeTrend points={[{ month: '2026-12', collectedPaisa: 345678 }]} />);
  expect(screen.getByText('December 2026')).toBeTruthy();
  expect(screen.getByText('PKR 3,456.78')).toBeTruthy();
});
it('OWN-004: unavailable chart does not invent a month or amount', async () => {
  await render(<OwnerIncomeTrend points={[]} />);
  expect(screen.getByText('Trend unavailable')).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
});

it('OWN-004: selected month opens the existing dashboard filter only when requested', async () => {
  const choose = jest.fn();
  await render(<OwnerIncomeTrend points={points} onChooseMonth={choose} />);
  await fireEvent.press(
    screen.getByRole('button', { name: 'View July 2026 collection: PKR 1,000.01' }),
  );
  expect(choose).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Open July 2026 dashboard' }));
  expect(choose).toHaveBeenCalledWith('2026-07');
});

it('OWN-004: an all-zero period explains the flat chart while preserving month inspection', async () => {
  await render(
    <OwnerIncomeTrend
      points={[
        { month: '2026-06', collectedPaisa: 0 },
        { month: '2026-07', collectedPaisa: 0 },
      ]}
    />,
  );
  expect(screen.getByText('No collections in this period')).toBeTruthy();
  await fireEvent.press(
    screen.getByRole('button', { name: 'View June 2026 collection: PKR 0.00' }),
  );
  expect(screen.getByText('June 2026')).toBeTruthy();
});
