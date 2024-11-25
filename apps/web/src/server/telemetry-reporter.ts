import { safeReport } from '@hsm/observability';
let report: () => void = () => undefined;
export function installWebReporter(send: () => unknown) {
  const previous = report;
  report = safeReport(send);
  return () => {
    report = previous;
  };
}
export function reportWebFailure() {
  report();
}
