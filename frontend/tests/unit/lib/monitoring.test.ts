import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initMonitoring,
  captureException,
  captureMessage,
  isMonitoringConfigured,
  __resetMonitoringForTests,
} from '@/lib/monitoring';

describe('lib/monitoring', () => {
  const originalDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

  beforeEach(() => {
    __resetMonitoringForTests();
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    __resetMonitoringForTests();
    if (originalDsn === undefined) delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    else process.env.NEXT_PUBLIC_SENTRY_DSN = originalDsn;
  });

  it('reports not configured when DSN is unset', () => {
    expect(isMonitoringConfigured()).toBe(false);
    initMonitoring();
    expect(isMonitoringConfigured()).toBe(false);
  });

  it('reports configured when DSN is present', () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = 'https://example@sentry.io/1';
    expect(isMonitoringConfigured()).toBe(true);
  });

  it('captureException always logs even without DSN', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    captureException(new Error('boom'), { source: 'test' });
    expect(spy).toHaveBeenCalled();
  });

  it('captureMessage logs at the requested level', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    captureMessage('hello', { a: 1 }, 'warning');
    expect(spy).toHaveBeenCalled();
  });
});
