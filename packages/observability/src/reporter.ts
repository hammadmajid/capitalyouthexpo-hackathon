export function safeReport(send: () => unknown): () => void {
  return () => {
    try {
      send();
    } catch {
      // SEC-003: provider failure must not alter application authorization or responses.
    }
  };
}
