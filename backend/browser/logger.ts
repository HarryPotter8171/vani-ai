/**
 * Structured browser automation logger.
 */

import type { BrowserLogEvent } from "./types.ts";

type Listener = (event: BrowserLogEvent) => void;

const listeners = new Set<Listener>();

function emit(
  level: BrowserLogEvent["level"],
  scope: string,
  message: string,
  meta?: Record<string, unknown>
) {
  const event: BrowserLogEvent = {
    level,
    scope,
    message,
    meta,
    timestamp: new Date().toISOString(),
  };

  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // Never let log listeners break automation.
    }
  }

  const debug =
    process.env.BROWSER_DEBUG === "1" || process.env.BROWSER_DEBUG === "true";
  if (level === "debug" && !debug) return;

  const prefix = `[browser:${scope}]`;
  const payload = meta ? `${message} ${JSON.stringify(meta)}` : message;

  if (level === "error") console.error(prefix, payload);
  else if (level === "warn") console.warn(prefix, payload);
  else console.log(prefix, payload);
}

export const browserLog = {
  debug: (scope: string, message: string, meta?: Record<string, unknown>) =>
    emit("debug", scope, message, meta),
  info: (scope: string, message: string, meta?: Record<string, unknown>) =>
    emit("info", scope, message, meta),
  warn: (scope: string, message: string, meta?: Record<string, unknown>) =>
    emit("warn", scope, message, meta),
  error: (scope: string, message: string, meta?: Record<string, unknown>) =>
    emit("error", scope, message, meta),
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
