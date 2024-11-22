import { safeReport } from '@hsm/observability';
let report: () => void = () => undefined;
export function installApiReporter(send: () => unknown) {
  const previous = report;
  report = safeReport(send);
  return () => {
    report = previous;
  };
}
export function reportUnexpectedFailure() {
  report();
}
