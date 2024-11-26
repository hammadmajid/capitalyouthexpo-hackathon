import { Component, type ReactNode } from 'react';
import { Page } from './frame';
import { Button, Copy } from './ui';
import { reportMobileFailure } from '../observability/binding';
import { safeMessage } from '../lib/messages';
// A screen crash names its cause instead of a generic "Unable to continue".
export class FailureBoundary extends Component<
  { children: ReactNode },
  { failed: boolean; error?: unknown }
> {
  override state: { failed: boolean; error?: unknown } = { failed: false };
  static getDerivedStateFromError(error: unknown) {
    return { failed: true, error };
  }
  override componentDidCatch() {
    reportMobileFailure();
  }
  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Page primary title="This screen stopped">
        <Copy alert>{safeMessage(this.state.error)}</Copy>
        <Button label="Try again" onPress={() => this.setState({ failed: false })} />
      </Page>
    );
  }
}
