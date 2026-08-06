/**
 * Structured Code Interpreter logger + audit trail.
 */

import type { AuditEvent } from "./types.ts";

type Listener = (event: AuditEvent) => void;

const listeners = new Set<Listener>();
const recentAudit: AuditEvent[] = [];
const MAX_AUDIT = 500;

function pushAudit(event: AuditEvent) {
  recentAudit.push(event);
  if (recentAudit.length > MAX_AUDIT) recentAudit.shift();
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // Never let audit listeners break execution.
    }
  }
}

function emit(
  level: AuditEvent["level"],
  action: string,
  userId: string,
  meta?: Record<string, unknown>,
  ids?: { sessionId?: string; executionId?: string }
) {
  const event: AuditEvent = {
    level,
    action,
    userId,
    sessionId: ids?.sessionId,
    executionId: ids?.executionId,
    meta,
    timestamp: new Date().toISOString(),
  };
  pushAudit(event);

  const debug =
    process.env.CODE_INTERPRETER_DEBUG === "1" ||
    process.env.CODE_INTERPRETER_DEBUG === "true";
  if (level === "info" && !debug && action.startsWith("stream.")) return;

  const prefix = `[code-interpreter:${action}]`;
  const payload = meta ? `${JSON.stringify({ userId, ...ids, ...meta })}` : userId;

  if (level === "error") console.error(prefix, payload);
  else if (level === "warn") console.warn(prefix, payload);
  else console.log(prefix, payload);
}

export const codeLog = {
  info(
    action: string,
    userId: string,
    meta?: Record<string, unknown>,
    ids?: { sessionId?: string; executionId?: string }
  ) {
    emit("info", action, userId, meta, ids);
  },
  warn(
    action: string,
    userId: string,
    meta?: Record<string, unknown>,
    ids?: { sessionId?: string; executionId?: string }
  ) {
    emit("warn", action, userId, meta, ids);
  },
  error(
    action: string,
    userId: string,
    meta?: Record<string, unknown>,
    ids?: { sessionId?: string; executionId?: string }
  ) {
    emit("error", action, userId, meta, ids);
  },
  audit(
    action: string,
    userId: string,
    meta?: Record<string, unknown>,
    ids?: { sessionId?: string; executionId?: string }
  ) {
    emit("info", action, userId, meta, ids);
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  recent(limit = 50): AuditEvent[] {
    return recentAudit.slice(-limit);
  },
};
