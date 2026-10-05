type ClientEvent = {
  kind: 'runtime-error' | 'unhandled-rejection' | 'react-error';
  message: string;
  stack?: string;
  path: string;
  release?: string;
  occurredAt: string;
};

const endpoint = import.meta.env.VITE_OBSERVABILITY_ENDPOINT?.trim();
const release = import.meta.env.VITE_APP_RELEASE?.trim();

function safeMessage(value: unknown): string {
  if (value instanceof Error) return value.message.slice(0, 500);
  if (typeof value === 'string') return value.slice(0, 500);
  return 'Unknown client error';
}

function deliver(event: ClientEvent): void {
  if (!endpoint) return;
  const body = JSON.stringify(event);
  if (navigator.sendBeacon?.(endpoint, new Blob([body], { type: 'application/json' }))) return;
  void fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
    keepalive: true,
    credentials: 'omit',
  }).catch(() => undefined);
}

export function captureClientError(kind: ClientEvent['kind'], error: unknown, stack?: string): void {
  const resolved = error instanceof Error ? error : undefined;
  deliver({
    kind,
    message: safeMessage(error),
    stack: (stack || resolved?.stack)?.slice(0, 4_000),
    path: window.location.pathname,
    release: release || undefined,
    occurredAt: new Date().toISOString(),
  });
}

export function installGlobalErrorReporting(): void {
  window.addEventListener('error', (event) => captureClientError('runtime-error', event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event) => captureClientError('unhandled-rejection', event.reason));
}
