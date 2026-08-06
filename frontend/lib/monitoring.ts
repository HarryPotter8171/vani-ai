/**
 * Frontend monitoring hooks — wires `@sentry/nextjs` when
 * `NEXT_PUBLIC_SENTRY_DSN` is set; otherwise console-only (safe for local/dev).
 */

type Severity = 'info' | 'warning' | 'error';

type CaptureContext = Record<string, unknown>;

type SentryClient = {
  init: (opts: Record<string, unknown>) => void;
  captureException: (error: unknown) => void;
  captureMessage: (message: string, opts?: { level?: string; extra?: CaptureContext }) => void;
  withScope: (fn: (scope: { setExtras: (extras: CaptureContext) => void }) => void) => void;
};

let initialized = false;
let sentry: SentryClient | null = null;
let initPromise: Promise<void> | null = null;

function getDsn(): string | undefined {
  if (typeof process === 'undefined') return undefined;
  return process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;
}

function applyExtras(context: CaptureContext): void {
  if (!sentry || !Object.keys(context).length) return;
  sentry.withScope((scope) => {
    scope.setExtras(context);
  });
}

/** Call once from a client root (layout effect / instrumentation). Safe to re-call. */
export function initMonitoring(): void {
  if (initialized) return;
  initialized = true;
  const dsn = getDsn();
  if (!dsn) {
    if (process.env.NODE_ENV !== 'production') {
      console.info('[monitoring] NEXT_PUBLIC_SENTRY_DSN not set — console-only');
    }
    return;
  }

  initPromise = import('@sentry/nextjs')
    .then((mod) => {
      const Sentry = mod as unknown as SentryClient;
      Sentry.init({
        dsn,
        environment:
          process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ||
          process.env.NODE_ENV ||
          'development',
        release: process.env.NEXT_PUBLIC_SENTRY_RELEASE || undefined,
        tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE) || 0,
      });
      sentry = Sentry;
    })
    .catch((err) => {
      console.error('[monitoring] failed to initialize Sentry', err);
    });
}

export function captureException(error: unknown, context: CaptureContext = {}): void {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error('[monitoring]', err.message, context, err);

  const send = () => {
    if (!sentry) return;
    if (Object.keys(context).length) {
      sentry.withScope((scope) => {
        scope.setExtras(context);
        sentry!.captureException(err);
      });
    } else {
      sentry.captureException(err);
    }
  };

  if (sentry) {
    send();
  } else if (initPromise) {
    void initPromise.then(send);
  }
}

export function captureMessage(
  message: string,
  context: CaptureContext = {},
  level: Severity = 'info'
): void {
  const log =
    level === 'error' ? console.error : level === 'warning' ? console.warn : console.info;
  log(`[monitoring] ${message}`, context);

  const send = () => {
    if (!sentry) return;
    applyExtras(context);
    sentry.captureMessage(message, { level, extra: context });
  };

  if (sentry) {
    send();
  } else if (initPromise) {
    void initPromise.then(send);
  }
}

/** High-resolution timer for client performance hooks. */
export function startTimer(name: string): () => number {
  const start =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  return () => {
    const end =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    const elapsed = end - start;
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[timing] ${name}: ${elapsed.toFixed(1)}ms`);
    }
    return elapsed;
  };
}

export function isMonitoringConfigured(): boolean {
  return Boolean(getDsn());
}

/** Test helper — reset module state between unit tests. */
export function __resetMonitoringForTests(): void {
  initialized = false;
  sentry = null;
  initPromise = null;
}
