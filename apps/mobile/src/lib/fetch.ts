export function timedFetch(transport: typeof fetch, milliseconds = 10000): typeof fetch {
  return async (request, init) => {
    const controller = new AbortController();
    const source =
      init?.signal ??
      (typeof Request !== 'undefined' && request instanceof Request ? request.signal : undefined);
    const cancel = () => controller.abort();
    if (source?.aborted) cancel();
    else source?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(cancel, milliseconds);
    try {
      return await transport(request, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      source?.removeEventListener('abort', cancel);
    }
  };
}
