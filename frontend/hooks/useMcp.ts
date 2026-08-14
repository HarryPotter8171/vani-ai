'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  callMcpTool,
  connectMcpServer,
  createMcpServer,
  deleteMcpServer,
  disconnectMcpServer,
  fetchMcpPermission,
  fetchMcpResources,
  fetchMcpServers,
  fetchMcpTools,
  grantMcpPermission,
  revokeMcpPermission,
  testMcpServer,
  updateMcpServer,
} from '@/lib/mcp/api';
import type {
  McpPermission,
  McpResourceInfo,
  McpServer,
  McpServerInput,
  McpToolInfo,
} from '@/lib/mcp/types';
import { getUserFriendlyError } from '@/lib/userFacingError';

export interface UseMcpOptions {
  enabled?: boolean;
}

export function useMcp({ enabled = true }: UseMcpOptions = {}) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toolsState, setToolsState] = useState<McpToolInfo[]>([]);
  const [resourcesState, setResourcesState] = useState<McpResourceInfo[]>([]);
  const [permissionState, setPermissionState] = useState<McpPermission | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const selected = servers.find((s) => s.id === selectedId) || null;
  const tools = selectedId ? toolsState : [];
  const resources = selectedId ? resourcesState : [];
  const permission = selectedId ? permissionState : null;

  const refresh = useCallback(async () => {
    setReloadToken((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const next = await fetchMcpServers();
        if (cancelled) return;
        setServers(next);
        setSelectedId((prev) => {
          if (prev && next.some((s) => s.id === prev)) return prev;
          return next[0]?.id ?? null;
        });
      } catch (err) {
        if (cancelled) return;
        setError(
          getUserFriendlyError(err, { fallback: 'Unable to load MCP servers' })
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, reloadToken]);

  useEffect(() => {
    if (!enabled || !selectedId) return;

    let cancelled = false;
    (async () => {
      try {
        const [nextTools, nextResources, nextPermission] = await Promise.all([
          fetchMcpTools(selectedId).catch(() => [] as McpToolInfo[]),
          fetchMcpResources(selectedId).catch(() => [] as McpResourceInfo[]),
          fetchMcpPermission(selectedId).catch(() => null),
        ]);
        if (cancelled) return;
        setToolsState(nextTools);
        setResourcesState(nextResources);
        setPermissionState(nextPermission);
      } catch {
        if (cancelled) return;
        setToolsState([]);
        setResourcesState([]);
        setPermissionState(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, selectedId, reloadToken, servers]);

  const addServer = useCallback(async (input: McpServerInput) => {
    setIsBusy(true);
    try {
      const server = await createMcpServer(input);
      setServers((prev) => [...prev, server]);
      setSelectedId(server.id);
      await refresh();
      return server;
    } finally {
      setIsBusy(false);
    }
  }, [refresh]);

  const patchServer = useCallback(
    async (id: string, patch: Partial<McpServerInput>) => {
      setIsBusy(true);
      try {
        const server = await updateMcpServer(id, patch);
        setServers((prev) => prev.map((s) => (s.id === id ? { ...s, ...server } : s)));
        await refresh();
        return server;
      } finally {
        setIsBusy(false);
      }
    },
    [refresh]
  );

  const removeServer = useCallback(async (id: string) => {
    setIsBusy(true);
    try {
      await deleteMcpServer(id);
      setServers((prev) => prev.filter((s) => s.id !== id));
      setSelectedId((prev) => (prev === id ? null : prev));
      await refresh();
    } finally {
      setIsBusy(false);
    }
  }, [refresh]);

  const connect = useCallback(async (id: string) => {
    setIsBusy(true);
    try {
      await connectMcpServer(id);
      await refresh();
    } finally {
      setIsBusy(false);
    }
  }, [refresh]);

  const disconnect = useCallback(async (id: string) => {
    setIsBusy(true);
    try {
      await disconnectMcpServer(id);
      await refresh();
    } finally {
      setIsBusy(false);
    }
  }, [refresh]);

  const testConnection = useCallback(async (id: string) => {
    setIsBusy(true);
    try {
      const result = await testMcpServer(id);
      await refresh();
      return result;
    } finally {
      setIsBusy(false);
    }
  }, [refresh]);

  const setEnabled = useCallback(
    async (id: string, value: boolean) => {
      return patchServer(id, { enabled: value });
    },
    [patchServer]
  );

  const trustServer = useCallback(async (id: string, trusted = true) => {
    setIsBusy(true);
    try {
      if (trusted) {
        const next = await grantMcpPermission(id, { trustServer: true });
        setPermissionState(next);
        return next;
      }
      const next = await revokeMcpPermission(id, { untrust: true });
      if (next.permission) setPermissionState(next.permission);
      return next.permission;
    } finally {
      setIsBusy(false);
    }
  }, []);

  const allowTool = useCallback(async (id: string, toolName: string) => {
    setIsBusy(true);
    try {
      const next = await grantMcpPermission(id, { toolName });
      setPermissionState(next);
      return next;
    } finally {
      setIsBusy(false);
    }
  }, []);

  const revokeAll = useCallback(async (id: string) => {
    setIsBusy(true);
    try {
      await revokeMcpPermission(id, { all: true });
      setPermissionState({
        userId: '',
        serverId: id,
        trusted: false,
        allowedTools: [],
        deniedTools: [],
      });
    } finally {
      setIsBusy(false);
    }
  }, []);

  const runTool = useCallback(
    async (id: string, toolName: string, args: Record<string, unknown> = {}) => {
      setIsBusy(true);
      try {
        return await callMcpTool(id, toolName, args);
      } finally {
        setIsBusy(false);
      }
    },
    []
  );

  return {
    servers,
    selected,
    selectedId,
    setSelectedId,
    tools,
    resources,
    permission,
    isLoading,
    isBusy,
    error,
    refresh,
    addServer,
    patchServer,
    removeServer,
    connect,
    disconnect,
    testConnection,
    setEnabled,
    trustServer,
    allowTool,
    revokeAll,
    runTool,
  };
}
