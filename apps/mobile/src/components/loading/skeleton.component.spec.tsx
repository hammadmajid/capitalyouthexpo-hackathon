import { Text, AccessibilityInfo } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { Skeleton, LoadingBoundary } from './skeleton';
beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
});
afterEach(() => jest.restoreAllMocks());
it('PERF-001: initial placeholders are accessible busy regions without exposing fake records', async () => {
  await render(
    <LoadingBoundary loading kind="listing">
      <Text>Listing result</Text>
    </LoadingBoundary>,
  );
  expect(screen.getByLabelText('Loading content').props.accessibilityState.busy).toBe(true);
  expect(screen.queryByText('Listing result')).toBeNull();
});
it('PERF-001: cached content remains mounted during background refresh', async () => {
  const view = await render(
    <LoadingBoundary loading={false} hasContent>
      <Text>Cached records</Text>
    </LoadingBoundary>,
  );
  await view.rerender(
    <LoadingBoundary loading hasContent>
      <Text>Cached records</Text>
    </LoadingBoundary>,
  );
  expect(screen.getByText('Cached records')).toBeTruthy();
  expect(screen.queryByLabelText('Loading content')).toBeNull();
});
it('PERF-001: error and empty states replace skeletons instead of an infinite placeholder', async () => {
  const view = await render(
    <LoadingBoundary loading error={new Error('Offline')}>
      <Text>Retry</Text>
    </LoadingBoundary>,
  );
  expect(screen.getByText('Retry')).toBeTruthy();
  await view.rerender(
    <LoadingBoundary loading={false}>
      <Text>No records</Text>
    </LoadingBoundary>,
  );
  expect(screen.getByText('No records')).toBeTruthy();
  expect(screen.queryByLabelText('Loading content')).toBeNull();
});
it('PERF-001: reduced-motion preference is honored for every skeleton region', async () => {
  await render(<Skeleton kind="form" label="Loading profile" />);
  expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalled();
  expect(screen.getByLabelText('Loading profile')).toBeTruthy();
});
