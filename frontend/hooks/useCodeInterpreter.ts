'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  codeFileDownloadUrl,
  createCodeSession,
  destroyCodeSession,
  executeCodeStream,
  fetchCodeHealth,
  fetchCodeSession,
  interruptCodeSession,
  publishCodeToCanvas,
  restartCodeKernel,
  uploadCodeFile,
} from '@/lib/codeInterpreter';
import type {
  CodeInterpreterHealth,
  CodeSession,
  ExecutionResult,
  GeneratedFile,
  PlotArtifact,
} from '@/lib/codeInterpreter';
import { getUserFriendlyError } from '@/lib/userFacingError';

const DEFAULT_CODE = `# VANI Code Interpreter
# pandas, numpy, matplotlib, openpyxl, reportlab are available.
# Write outputs to OUTPUTS/ and plots will auto-save under PLOTS/.

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

x = np.linspace(0, 2 * np.pi, 200)
y = np.sin(x)

plt.figure(figsize=(6, 3.5))
plt.plot(x, y, color="#6b5cff", linewidth=2)
plt.title("Sine wave")
plt.xlabel("x")
plt.ylabel("sin(x)")
plt.grid(True, alpha=0.3)
plt.show()

pd.DataFrame({"x": x[:5], "sin": y[:5]})
`;

export interface UseCodeInterpreterOptions {
  enabled?: boolean;
  onError?: (message: string) => void;
  onGateDenial?: (denial: import('@/lib/billing/gateError').GateDenial) => void;
}

export function useCodeInterpreter({
  enabled = true,
  onError,
  onGateDenial,
}: UseCodeInterpreterOptions = {}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [session, setSession] = useState<CodeSession | null>(null);
  const [code, setCode] = useState(DEFAULT_CODE);
  const [stdout, setStdout] = useState('');
  const [stderr, setStderr] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [health, setHealth] = useState<CodeInterpreterHealth | null>(null);
  const [files, setFiles] = useState<GeneratedFile[]>([]);
  const [plots, setPlots] = useState<PlotArtifact[]>([]);
  const [lastResult, setLastResult] = useState<ExecutionResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionRef = useRef<CodeSession | null>(null);
  const onErrorRef = useRef(onError);
  const onGateDenialRef = useRef(onGateDenial);

  useEffect(() => {
    onErrorRef.current = onError;
    onGateDenialRef.current = onGateDenial;
  }, [onError, onGateDenial]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const fail = useCallback((message: string, err?: unknown) => {
    const friendly = getUserFriendlyError(err ?? message, {
      feature: 'code',
      fallback: message,
    });
    if (
      err &&
      typeof err === 'object' &&
      (err as { name?: string }).name === 'GateDenialError' &&
      'denial' in err
    ) {
      onGateDenialRef.current?.(
        (err as { denial: import('@/lib/billing/gateError').GateDenial }).denial
      );
      setError(friendly);
      if (!onGateDenialRef.current) onErrorRef.current?.(friendly);
      return;
    }
    setError(friendly);
    onErrorRef.current?.(friendly);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const h = await fetchCodeHealth();
        if (!cancelled) setHealth(h);
      } catch {
        // quiet during boot
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const ensureSession = useCallback(async () => {
    const current = sessionRef.current;
    if (current?.sessionId) {
      try {
        const next = await fetchCodeSession(current.sessionId);
        setSession(next);
        setFiles(next.files || []);
        setPlots(next.plots || []);
        return next;
      } catch {
        // recreate below
      }
    }
    setIsStarting(true);
    try {
      const next = await createCodeSession();
      setSession(next);
      setFiles(next.files || []);
      setPlots(next.plots || []);
      setError(null);
      return next;
    } catch (err) {
      fail('Unable to start session', err);
      throw err;
    } finally {
      setIsStarting(false);
    }
  }, [fail]);

  const run = useCallback(async () => {
    if (isRunning) return;
    setIsRunning(true);
    setStdout('');
    setStderr('');
    setError(null);
    setPanelOpen(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const active = await ensureSession();
      const result = await executeCodeStream(
        active.sessionId,
        code,
        (event) => {
          if (event.type === 'stdout' && event.data) {
            setStdout((prev) => prev + event.data);
          } else if (event.type === 'stderr' && event.data) {
            setStderr((prev) => prev + event.data);
          } else if (event.type === 'error' && event.error) {
            setError(
              getUserFriendlyError(event.error, {
                feature: 'code',
                fallback: 'Code execution is temporarily unavailable.',
              })
            );
          } else if (event.type === 'plot' && event.plot) {
            setPlots((prev) => [...prev, event.plot!]);
          } else if (event.type === 'file' && event.file) {
            setFiles((prev) => {
              if (prev.some((f) => f.id === event.file!.id)) return prev;
              return [event.file!, ...prev];
            });
          } else if (event.type === 'result' && event.data) {
            setStdout((prev) =>
              prev.includes(event.data!) ? prev : `${prev}${prev ? '\n' : ''}${event.data}\n`
            );
          }
        },
        { signal: controller.signal }
      );

      if (result) {
        setLastResult(result);
        if (result.stdout) setStdout(result.stdout);
        if (result.stderr) setStderr(result.stderr);
        if (result.error) {
          setError(
            getUserFriendlyError(result.error, {
              feature: 'code',
              fallback: 'Code execution is temporarily unavailable.',
            })
          );
        }
        if (result.plots?.length) {
          setPlots((prev) => {
            const ids = new Set(prev.map((p) => p.id));
            return [...prev, ...result.plots.filter((p) => !ids.has(p.id))];
          });
        }
        if (result.files?.length) {
          setFiles((prev) => {
            const ids = new Set(prev.map((f) => f.id));
            return [...result.files.filter((f) => !ids.has(f.id)), ...prev];
          });
        }
      }

      const refreshed = await fetchCodeSession(active.sessionId);
      setSession(refreshed);
      setFiles(refreshed.files || []);
      setPlots(refreshed.plots || []);
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      fail('Execution failed', err);
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  }, [code, ensureSession, fail, isRunning]);

  const interrupt = useCallback(async () => {
    abortRef.current?.abort();
    const current = sessionRef.current;
    if (!current?.sessionId) {
      setIsRunning(false);
      return;
    }
    try {
      const next = await interruptCodeSession(current.sessionId);
      setSession(next);
    } catch (err) {
      fail('Unable to interrupt', err);
    } finally {
      setIsRunning(false);
    }
  }, [fail]);

  const restart = useCallback(async () => {
    const active = sessionRef.current || (await ensureSession());
    try {
      const next = await restartCodeKernel(active.sessionId);
      setSession(next);
      setStdout('');
      setStderr('');
      setError(null);
      setLastResult(null);
    } catch (err) {
      fail('Unable to restart kernel', err);
    }
  }, [ensureSession, fail]);

  const upload = useCallback(
    async (file: File) => {
      const active = await ensureSession();
      setUploadProgress(0);
      try {
        const uploaded = await uploadCodeFile(active.sessionId, file, (pct) =>
          setUploadProgress(pct)
        );
        setFiles((prev) => [uploaded, ...prev.filter((f) => f.id !== uploaded.id)]);
        setPanelOpen(true);
        return uploaded;
      } catch (err) {
        fail('Upload failed', err);
        return null;
      } finally {
        setUploadProgress(null);
      }
    },
    [ensureSession, fail]
  );

  const publishCanvas = useCallback(
    async (chatId?: string | null) => {
      const current = sessionRef.current;
      if (!current?.sessionId) return null;
      try {
        const { canvasId } = await publishCodeToCanvas(current.sessionId, {
          chatId: chatId || undefined,
          title: 'Code Interpreter Chart',
        });
        return canvasId;
      } catch (err) {
        fail('Unable to publish to Canvas', err);
        return null;
      }
    },
    [fail]
  );

  const closeSession = useCallback(async () => {
    const current = sessionRef.current;
    if (!current?.sessionId) {
      setPanelOpen(false);
      return;
    }
    try {
      await destroyCodeSession(current.sessionId);
    } catch {
      // ignore
    }
    setSession(null);
    setFiles([]);
    setPlots([]);
    setLastResult(null);
    setStdout('');
    setStderr('');
    setPanelOpen(false);
  }, []);

  const fileUrl = useCallback((fileId: string) => {
    const current = sessionRef.current;
    return current?.sessionId ? codeFileDownloadUrl(current.sessionId, fileId) : null;
  }, []);

  return {
    panelOpen,
    setPanelOpen,
    session,
    code,
    setCode,
    stdout,
    stderr,
    error,
    isRunning,
    isStarting,
    uploadProgress,
    health,
    files,
    plots,
    lastResult,
    run,
    interrupt,
    restart,
    upload,
    publishCanvas,
    closeSession,
    ensureSession,
    fileUrl,
    openPanel: () => setPanelOpen(true),
  };
}
