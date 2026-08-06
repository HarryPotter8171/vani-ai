'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Cable, CheckCircle2, Circle, FolderOpen, Pencil, Plus, Plug, PlugZap, RefreshCw, Server, Shield, ShieldCheck, ShieldOff, Trash2, Unplug, Wrench, X, FileText, AlertCircle, Brain, Terminal } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { PremiumEmpty } from '@/components/ui/PremiumEmpty';
import { ErrorState } from '@/components/ui/ErrorState';
import { cn } from '@/lib/utils';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { useMcp } from '@/hooks/useMcp';
import {
  MCP_STATUS_LABELS,
  MCP_TRANSPORT_LABELS,
  type McpConnectionStatus,
  type McpServer,
  type McpTransportConfig } from '@/lib/mcp/types';

export interface McpSettingsProps {
  open: boolean;
  onClose: () => void;
}

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

type ServerPreset = 'filesystem' | 'memory' | 'custom';

type ServerFormValues = {
  name: string;
  description: string;
  command: string;
  args: string;
  filesystemPath: string;
};

const PRESET_META: Record<
  ServerPreset,
  { label: string; hint: string; Icon: typeof FolderOpen }
> = {
  filesystem: {
    label: 'Filesystem',
    hint: 'Local files via @modelcontextprotocol/server-filesystem',
    Icon: FolderOpen },
  memory: {
    label: 'Memory',
    hint: 'Knowledge graph via @modelcontextprotocol/server-memory',
    Icon: Brain },
  custom: {
    label: 'Custom stdio',
    hint: 'Any stdio MCP server (command + args)',
    Icon: Terminal } };

function statusColor(status?: McpConnectionStatus) {
  switch (status) {
    case 'connected':
      return 'bg-emerald-500';
    case 'connecting':
    case 'reconnecting':
      return 'bg-amber-400 animate-pulse';
    case 'error':
      return 'bg-red-500';
    case 'disabled':
      return 'bg-zinc-400';
    default:
      return 'bg-zinc-400/70';
  }
}

function parseArgs(raw: string): string[] {
  return raw
    .split(/\n|,/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function argsToText(args?: string[]): string {
  return (args || []).join('\n');
}

function detectPreset(server?: McpServer | null): ServerPreset {
  if (!server || server.transport.type !== 'stdio') return 'custom';
  const joined = (server.transport.args || []).join(' ');
  if (joined.includes('@modelcontextprotocol/server-filesystem')) return 'filesystem';
  if (joined.includes('@modelcontextprotocol/server-memory')) return 'memory';
  return 'custom';
}

function valuesFromServer(server: McpServer): ServerFormValues {
  const transport = server.transport;
  if (transport.type !== 'stdio') {
    return {
      name: server.name,
      description: server.description || '',
      command: 'npx',
      args: '',
      filesystemPath: '' };
  }
  const args = transport.args || [];
  const fsIdx = args.findIndex((a) => a.includes('server-filesystem'));
  const filesystemPath =
    fsIdx >= 0 ? args.slice(fsIdx + 1).join(' ') : args[args.length - 1] || '';

  return {
    name: server.name,
    description: server.description || '',
    command: transport.command || 'npx',
    args: argsToText(args),
    filesystemPath: filesystemPath.trim() };
}

function defaultsForPreset(preset: ServerPreset): Partial<ServerFormValues> {
  switch (preset) {
    case 'filesystem':
      return {
        name: 'Filesystem',
        description: 'Read and write files in an allowed directory',
        command: 'npx',
        args: '',
        filesystemPath: '' };
    case 'memory':
      return {
        name: 'Memory',
        description: 'Persistent knowledge-graph memory for agents',
        command: 'npx',
        args: '-y\n@modelcontextprotocol/server-memory',
        filesystemPath: '' };
    default:
      return {
        name: '',
        description: '',
        command: 'npx',
        args: '',
        filesystemPath: '' };
  }
}

function validateServerForm(
  preset: ServerPreset,
  values: ServerFormValues
): string | null {
  const name = values.name.trim();
  if (!name) return 'Server name is required';
  if (name.length > 80) return 'Server name must be 80 characters or fewer';

  const command = values.command.trim();
  if (!command) return 'Command is required for stdio servers';
  if (command.length > 500) return 'Command is too long';

  if (preset === 'filesystem') {
    const path = values.filesystemPath.trim();
    if (!path) return 'Allowed directory path is required for Filesystem';
    if (path.includes('\n') || path.includes(',')) {
      return 'Enter a single directory path';
    }
  }

  if (preset === 'custom') {
    const args = parseArgs(values.args);
    if (args.length === 0) {
      return 'Add at least one argument (e.g. package name)';
    }
  }

  if (values.description.length > 500) {
    return 'Description must be 500 characters or fewer';
  }

  return null;
}

function buildTransport(
  preset: ServerPreset,
  values: ServerFormValues
): McpTransportConfig {
  const command = values.command.trim();

  if (preset === 'filesystem') {
    return {
      type: 'stdio',
      command,
      args: [
        '-y',
        '@modelcontextprotocol/server-filesystem',
        values.filesystemPath.trim(),
      ] };
  }

  if (preset === 'memory') {
    return {
      type: 'stdio',
      command,
      args: parseArgs(values.args).length
        ? parseArgs(values.args)
        : ['-y', '@modelcontextprotocol/server-memory'] };
  }

  return {
    type: 'stdio',
    command,
    args: parseArgs(values.args) };
}

function ServerDialog({
  mode,
  initial,
  saving,
  onClose,
  onSubmit }: {
  mode: 'create' | 'edit';
  initial?: McpServer | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    description?: string;
    transport: McpTransportConfig;
  }) => Promise<void>;
}) {
  const [preset, setPreset] = useState<ServerPreset>(() =>
    mode === 'edit' ? detectPreset(initial) : 'memory'
  );
  const [values, setValues] = useState<ServerFormValues>(() => {
    if (mode === 'edit' && initial) return valuesFromServer(initial);
    return {
      name: 'Memory',
      description: 'Persistent knowledge-graph memory for agents',
      command: 'npx',
      args: '-y\n@modelcontextprotocol/server-memory',
      filesystemPath: '' };
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const applyPreset = (next: ServerPreset) => {
    setPreset(next);
    setError(null);
    setValues((prev) => ({
      ...prev,
      ...defaultsForPreset(next),
      // Keep name when editing if user already customized it
      ...(mode === 'edit' && prev.name.trim()
        ? { name: prev.name, description: prev.description }
        : {}) }));
  };

  const patch = (partial: Partial<ServerFormValues>) => {
    setValues((prev) => ({ ...prev, ...partial }));
    setError(null);
  };

  const handleSave = async () => {
    const validationError = validateServerForm(preset, values);
    if (validationError) {
      setError(validationError);
      return;
    }
    try {
      await onSubmit({
        name: values.name.trim(),
        description: values.description.trim() || undefined,
        transport: buildTransport(preset, values) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save server');
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[130] flex items-end justify-center sm:items-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
 />
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mcp-server-dialog-title"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.22, ease: EASE }}
        className={cn(
          'relative w-full max-w-[480px] overflow-hidden',
          'rounded-t-[24px] sm:rounded-[24px]',
          'bg-white/95 dark:bg-[#161618]/96',
          'border border-border',
          'shadow-[0_24px_80px_rgba(0,0,0,0.35)]'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/[0.05] px-5 py-4 dark:border-white/[0.06]">
          <div>
            <h3
              id="mcp-server-dialog-title"
              className="text-assistant font-semibold tracking-[-0.02em] text-foreground"
            >
              {mode === 'edit' ? 'Edit MCP Server' : 'Create MCP Server'}
            </h3>
            <p className="mt-0.5 text-caption text-muted-foreground/65">
              Filesystem, Memory, or a custom stdio server
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-muted-foreground/60 hover:bg-surface-hover hover:text-foreground"
          >
            <X size={15} />
          </button>
        </div>

        <div className="max-h-[min(70vh,560px)] space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            {(Object.keys(PRESET_META) as ServerPreset[]).map((key) => {
              const meta = PRESET_META[key];
              const Icon = meta.Icon;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyPreset(key)}
                  className={cn(
                    'flex flex-col items-start gap-1 rounded-[14px] px-3 py-2.5 text-left',
                    'border transition-colors',
                    preset === key
                      ? 'border-primary/40 bg-primary/10 text-foreground'
                      : 'border-black/[0.05] bg-black/[0.02] text-foreground/75 hover:bg-black/[0.04] dark:border-white/[0.06] dark:bg-white/[0.03]'
                  )}
                >
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                    <Icon size={13} />
                    {meta.label}
                  </span>
                  <span className="text-micro leading-snug text-muted-foreground/55">
                    {meta.hint}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="space-y-2.5">
            <Input
              value={values.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="Server name"
              autoFocus
            />
            <Input
              value={values.description}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="Optional description"
              className="text-sm"
            />
            <Input
              value={values.command}
              onChange={(e) => patch({ command: e.target.value })}
              placeholder="Command (e.g. npx)"
              className="font-mono text-sm"
            />

            {preset === 'filesystem' ? (
              <Input
                value={values.filesystemPath}
                onChange={(e) => patch({ filesystemPath: e.target.value })}
                placeholder="Allowed directory (e.g. /Users/you/Documents)"
                className="font-mono text-sm"
              />
            ) : (
              <Textarea
                value={values.args}
                onChange={(e) => patch({ args: e.target.value })}
                placeholder="Args (one per line)"
                rows={3}
                className="font-mono text-caption"
              />
            )}
          </div>

          {error ? (
            <p className="flex items-start gap-1.5 text-sm text-red-500/90">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              {error}
            </p>
          ) : null}
        </div>

        <div className="flex justify-end gap-1.5 border-t border-black/[0.05] px-5 py-3.5 dark:border-white/[0.06]">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={saving}
            className="px-3.5 text-sm"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={saving}
            onClick={() => void handleSave()}
            className="px-4 shadow-none hover:shadow-none disabled:opacity-40"
          >
            {saving
              ? mode === 'edit'
                ? 'Saving…'
                : 'Creating…'
              : mode === 'edit'
                ? 'Save changes'
                : 'Create server'}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function McpSettings({ open, onClose }: McpSettingsProps) {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const mcp = useMcp({ enabled: open });
  const [dialogModeState, setDialogMode] = useState<'create' | 'edit' | null>(null);
  const [detailTab, setDetailTab] = useState<'tools' | 'resources' | 'permissions'>('tools');
  // Avoid setState-on-close effects: ignore dialog mode while the sheet is closed.
  const dialogMode = open ? dialogModeState : null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dialogModeState === null) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, dialogModeState]);

  const selected = mcp.selected;

  const transportSummary = useMemo(() => {
    if (!selected) return '';
    const t = selected.transport;
    if (t.type === 'stdio') {
      return `${t.command} ${(t.args || []).join(' ')}`.trim();
    }
    return t.url;
  }, [selected]);

  const openCreateDialog = () => setDialogMode('create');
  const openEditDialog = () => {
    if (!selected) return;
    setDialogMode('edit');
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 modal-overlay"
        onClick={onClose}
        aria-hidden="true"
 />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mcp-settings-title"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.28, ease: EASE }}
        className={cn(
          'relative flex h-[min(90vh,860px)] w-full max-w-[880px] flex-col overflow-hidden',
          'rounded-t-[28px] sm:rounded-[28px]',
          'bg-surface',
          'backdrop-blur-2xl backdrop-saturate-[1.6]',
          'border border-border',
          'shadow-[0_24px_80px_rgba(0,0,0,0.28)] dark:shadow-[0_28px_90px_rgba(0,0,0,0.65)]'
        )}
        onClick={(e) => e.stopPropagation()}
      >
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute -left-20 -top-24 h-56 w-56 rounded-full bg-accent/12 blur-3xl" />
              <div className="absolute -right-16 top-32 h-48 w-48 rounded-full bg-[#5e5ce6]/10 blur-3xl" />
            </div>

            <div className="relative flex items-start justify-between gap-4 border-b border-black/[0.05] px-5 pb-4 pt-5 dark:border-white/[0.06] sm:px-6">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-[14px] bg-gradient-to-b from-accent to-accent-hover text-text-on-accent shadow-[0_4px_16px_var(--accent-glow)]">
                  <Cable size={18} strokeWidth={1.75} />
                </div>
                <div>
                  <h2
                    id="mcp-settings-title"
                    className="text-title font-semibold tracking-[-0.025em] text-foreground"
                  >
                    Settings · MCP
                  </h2>
                  <p className="mt-0.5 text-sm text-muted-foreground/70">
                    Connect Model Context Protocol servers for tools and resources
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close MCP settings"
                className="rounded-full p-2 text-muted-foreground/60 hover:bg-surface-hover hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>

            <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">
              {/* Server list */}
              <div className="flex w-full flex-col border-b border-border md:w-[300px] md:border-b-0 md:border-r">
                <div className="flex items-center justify-between gap-2 px-4 py-3">
                  <span className="text-micro font-semibold uppercase tracking-[0.08em] text-muted-foreground/45">
                    Servers
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void mcp.refresh()}
                      className="rounded-full p-1.5 text-muted-foreground/60 hover:bg-surface-hover hover:text-foreground"
                      title="Refresh"
                    >
                      <RefreshCw size={13} className={mcp.isLoading ? 'animate-spin' : ''} />
                    </button>
                    <button
                      type="button"
                      onClick={openCreateDialog}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-micro font-medium text-primary hover:bg-primary/15"
                    >
                      <Plus size={12} />
                      Add
                    </button>
                  </div>
                </div>

                <div className="custom-scrollbar flex-1 space-y-1 overflow-y-auto px-3 pb-4">
                  {mcp.isLoading && !mcp.servers.length ? (
                    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground/60">
                      <Spinner size={14} />
                      Loading servers…
                    </div>
                  ) : null}

                  {!mcp.isLoading && !mcp.servers.length ? (
                    <PremiumEmpty
                      size="sm"
                      icon={Server}
                      title="No MCP servers yet"
                      description="Add Filesystem, Memory, or a custom stdio server"
                      action={
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={openCreateDialog}
                          leftIcon={<Plus size={12} />}
                          className="shadow-none hover:shadow-none"
                        >
                          Add server
                        </Button>
                      }
                    />
                  ) : null}

                  {mcp.servers.map((server) => (
                    <button
                      key={server.id}
                      type="button"
                      onClick={() => mcp.setSelectedId(server.id)}
                      className={cn(
                        'flex w-full items-start gap-2.5 rounded-[16px] px-3 py-2.5 text-left',
                        'transition-colors',
                        selected?.id === server.id
                          ? 'bg-primary/10 dark:bg-primary/15'
                          : 'hover:bg-surface-hover'
                      )}
                    >
                      <span
                        className={cn(
                          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                          statusColor(server.status)
                        )}
 />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium tracking-[-0.014em] text-foreground">
                          {server.name}
                        </span>
                        <span className="mt-0.5 block truncate text-micro text-muted-foreground/55">
                          {MCP_TRANSPORT_LABELS[server.transport.type]} ·{' '}
                          {MCP_STATUS_LABELS[server.status || 'disconnected']}
                          {!server.enabled ? ' · Off' : ''}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Detail */}
              <div className="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4 sm:px-6">
                {!selected ? (
                  <div className="flex h-full flex-col items-center justify-center text-center">
                    <Plug size={28} className="text-muted-foreground/35" />
                    <p className="mt-3 text-sidebar font-medium text-foreground/75">
                      Select a server
                    </p>
                    <p className="mt-1 max-w-xs text-sm text-muted-foreground/55">
                      View status, tools, resources, and permissions
                    </p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-assistant font-semibold tracking-[-0.02em] text-foreground">
                          {selected.name}
                        </h3>
                        {selected.description ? (
                          <p className="mt-1 text-sm text-muted-foreground/65">
                            {selected.description}
                          </p>
                        ) : null}
                        <p className="mt-1.5 font-mono text-micro text-muted-foreground/50">
                          {transportSummary}
                        </p>
                        {selected.lastError ? (
                          <p className="mt-2 flex items-start gap-1.5 text-caption text-red-500/90">
                            <AlertCircle size={13} className="mt-0.5 shrink-0" />
                            {selected.lastError}
                          </p>
                        ) : null}
                      </div>

                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-black/[0.04] px-3 py-1.5 text-caption dark:bg-white/[0.06]">
                        <span className="text-foreground/70">Enabled</span>
                        <input
                          type="checkbox"
                          checked={selected.enabled}
                          disabled={mcp.isBusy}
                          onChange={(e) => {
                            void mcp
                              .setEnabled(selected.id, e.target.checked)
                              .then(() => {
                                showToast(
                                  e.target.checked ? 'Server enabled' : 'Server disabled',
                                  'success'
                                );
                                return mcp.refresh();
                              })
                              .catch((err) => {
                                showToast(
                                  err instanceof Error ? err.message : 'Update failed',
                                  'error'
                                );
                              });
                          }}
                          className="accent-primary"
 />
                      </label>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={mcp.isBusy}
                        onClick={openEditDialog}
                        className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] px-3 py-1.5 text-caption dark:bg-white/[0.06]"
                      >
                        <Pencil size={13} />
                        Edit
                      </button>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        disabled={mcp.isBusy || !selected.enabled}
                        onClick={() => {
                          void mcp
                            .testConnection(selected.id)
                            .then((result) => {
                              showToast(
                                result.health?.healthy
                                  ? `Connection healthy (${result.health.latencyMs ?? 0}ms)`
                                  : result.health?.lastError || 'Connection issue',
                                result.health?.healthy ? 'success' : 'error'
                              );
                            })
                            .catch((err) => {
                              showToast(
                                err instanceof Error ? err.message : 'Test failed',
                                'error'
                              );
                            });
                        }}
                        leftIcon={<PlugZap size={13} />}
                        className="shadow-none hover:shadow-none disabled:opacity-40"
                      >
                        Test connection
                      </Button>
                      {selected.status === 'connected' ? (
                        <button
                          type="button"
                          disabled={mcp.isBusy}
                          onClick={() => void mcp.disconnect(selected.id)}
                          className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] px-3 py-1.5 text-caption dark:bg-white/[0.06]"
                        >
                          <Unplug size={13} />
                          Disconnect
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={mcp.isBusy || !selected.enabled}
                          onClick={() =>
                            void mcp.connect(selected.id).then(() => {
                              showToast('Connected', 'success');
                            }).catch((err) => {
                              showToast(
                                err instanceof Error ? err.message : 'Connect failed',
                                'error'
                              );
                            })
                          }
                          className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] px-3 py-1.5 text-caption dark:bg-white/[0.06]"
                        >
                          <Plug size={13} />
                          {selected.lastConnectedAt || selected.status === 'error'
                            ? 'Reconnect'
                            : 'Connect'}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={mcp.isBusy}
                        onClick={async () => {
                          const ok = await confirm({
                            title: `Remove “${selected.name}”?`,
                            description: 'This disconnects the server and revokes permissions.',
                            confirmLabel: 'Remove',
                            variant: 'danger' });
                          if (!ok) return;
                          await mcp.removeServer(selected.id);
                          showToast('Server removed', 'success');
                        }}
                        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-caption text-red-500/90 hover:bg-red-500/10"
                      >
                        <Trash2 size={13} />
                        Remove
                      </button>
                    </div>

                    <div className="flex gap-1 rounded-full bg-black/[0.03] p-1 dark:bg-white/[0.04]">
                      {(
                        [
                          ['tools', 'Tools', Wrench],
                          ['resources', 'Resources', FileText],
                          ['permissions', 'Permissions', Shield],
                        ] as const
                      ).map(([id, label, Icon]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setDetailTab(id)}
                          className={cn(
                            'flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-caption font-medium',
                            detailTab === id
                              ? 'bg-white text-foreground shadow-sm dark:bg-white/[0.1]'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          <Icon size={12} />
                          {label}
                        </button>
                      ))}
                    </div>

                    {detailTab === 'tools' && (
                      <div className="space-y-2">
                        {!mcp.tools.length ? (
                          <PremiumEmpty
                            size="sm"
                            icon={Wrench}
                            title="No tools available"
                            description="Connect the server to refresh capabilities."
                            className="py-6"
                          />
                        ) : (
                          mcp.tools.map((tool) => (
                            <div
                              key={tool.name}
                              className="rounded-[16px] border border-black/[0.05] bg-black/[0.02] px-3.5 py-3 dark:border-white/[0.06] dark:bg-white/[0.03]"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-medium tracking-[-0.014em]">
                                    {tool.name}
                                  </p>
                                  {tool.agentToolName ? (
                                    <p className="mt-0.5 font-mono text-micro text-muted-foreground/45">
                                      agent: {tool.agentToolName}
                                    </p>
                                  ) : null}
                                </div>
                                <button
                                  type="button"
                                  disabled={mcp.isBusy}
                                  onClick={async () => {
                                    const allowed = await confirm({
                                      title: `Allow “${tool.name}”?`,
                                      description:
                                        'VANI will remember this permission for future agent runs.',
                                      confirmLabel: 'Allow tool' });
                                    if (!allowed) return;
                                    await mcp.allowTool(selected.id, tool.name);
                                    showToast(`Allowed ${tool.name}`, 'success');
                                  }}
                                  className="rounded-full px-2.5 py-1 text-micro text-primary hover:bg-primary/10"
                                >
                                  Allow
                                </button>
                              </div>
                              {tool.description ? (
                                <p className="mt-1.5 text-caption leading-relaxed text-muted-foreground/65">
                                  {tool.description}
                                </p>
                              ) : null}
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {detailTab === 'resources' && (
                      <div className="space-y-2">
                        {!mcp.resources.length ? (
                          <PremiumEmpty
                            size="sm"
                            icon={FolderOpen}
                            title="No resources published"
                            description="This server has not published any resources."
                            className="py-6"
                          />
                        ) : (
                          mcp.resources.map((resource) => (
                            <div
                              key={resource.uri}
                              className="rounded-[16px] border border-black/[0.05] bg-black/[0.02] px-3.5 py-3 dark:border-white/[0.06] dark:bg-white/[0.03]"
                            >
                              <p className="text-sm font-medium">
                                {resource.name || resource.uri}
                              </p>
                              <p className="mt-0.5 break-all font-mono text-micro text-muted-foreground/45">
                                {resource.uri}
                              </p>
                              {resource.description ? (
                                <p className="mt-1.5 text-caption text-muted-foreground/65">
                                  {resource.description}
                                </p>
                              ) : null}
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {detailTab === 'permissions' && (
                      <div className="space-y-3">
                        <div className="rounded-[16px] border border-black/[0.05] bg-black/[0.02] px-3.5 py-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              {mcp.permission?.trusted ? (
                                <ShieldCheck size={16} className="text-emerald-500" />
                              ) : (
                                <ShieldOff size={16} className="text-muted-foreground/50" />
                              )}
                              <div>
                                <p className="text-sm font-medium">Trusted server</p>
                                <p className="text-micro text-muted-foreground/55">
                                  Skip per-tool prompts for this server
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={mcp.isBusy}
                              onClick={async () => {
                                if (mcp.permission?.trusted) {
                                  await mcp.trustServer(selected.id, false);
                                  showToast('Trust revoked', 'success');
                                  return;
                                }
                                const ok = await confirm({
                                  title: `Trust “${selected.name}”?`,
                                  description:
                                    'Agents may run any tool from this server without asking again.',
                                  confirmLabel: 'Trust server' });
                                if (!ok) return;
                                await mcp.trustServer(selected.id, true);
                                showToast('Server trusted', 'success');
                              }}
                              className={cn(
                                'rounded-full px-3 py-1.5 text-caption font-medium',
                                mcp.permission?.trusted
                                  ? 'bg-black/[0.05] text-foreground/70 dark:bg-white/[0.08]'
                                  : 'bg-primary text-white'
                              )}
                            >
                              {mcp.permission?.trusted ? 'Revoke trust' : 'Trust'}
                            </button>
                          </div>
                        </div>

                        <div>
                          <p className="mb-2 text-micro font-semibold uppercase tracking-[0.08em] text-muted-foreground/45">
                            Allowed tools
                          </p>
                          {(mcp.permission?.allowedTools || []).length === 0 ? (
                            <PremiumEmpty
                              size="sm"
                              icon={Shield}
                              title="No tools allowed yet"
                              description="Allow individual tools from the Tools tab."
                              className="py-4"
                            />
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {mcp.permission?.allowedTools.map((name) => (
                                <span
                                  key={name}
                                  className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-micro text-emerald-700 dark:text-emerald-300"
                                >
                                  <CheckCircle2 size={11} />
                                  {name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={mcp.isBusy}
                          onClick={async () => {
                            const ok = await confirm({
                              title: 'Revoke all permissions?',
                              description: 'Trust and allowed tools will be cleared.',
                              confirmLabel: 'Revoke all',
                              variant: 'danger' });
                            if (!ok) return;
                            await mcp.revokeAll(selected.id);
                            showToast('Permissions revoked', 'success');
                          }}
                          className="text-caption text-red-500/90 hover:underline"
                        >
                          Revoke all permissions
                        </button>
                      </div>
                    )}

                    <div className="rounded-[16px] border border-black/[0.04] px-3.5 py-3 text-micro text-muted-foreground/50 dark:border-white/[0.05]">
                      <div className="flex items-center gap-1.5">
                        <Circle
                          size={8}
                          className={cn('fill-current', statusColor(selected.status))}
 />
                        Status: {MCP_STATUS_LABELS[selected.status || 'disconnected']}
                        {selected.lastConnectedAt
                          ? ` · Last connected ${new Date(selected.lastConnectedAt).toLocaleString()}`
                          : ''}
                      </div>
                    </div>
                  </div>
                )}

                {mcp.error ? (
                  <ErrorState
                    compact
                    title="MCP error"
                    message={mcp.error}
                    onRetry={() => void mcp.refresh()}
                    className="mt-2"
                  />
                ) : null}
              </div>
            </div>
          </motion.div>

          <AnimatePresence>
            {dialogMode && (
              <ServerDialog
                key={dialogMode === 'edit' ? `edit-${selected?.id || 'none'}` : 'create'}
                mode={dialogMode}
                initial={dialogMode === 'edit' ? selected : null}
                saving={mcp.isBusy}
                onClose={() => setDialogMode(null)}
                onSubmit={async (data) => {
                  if (dialogMode === 'edit' && selected) {
                    await mcp.patchServer(selected.id, data);
                    setDialogMode(null);
                    await mcp.refresh();
                    showToast(`Updated ${data.name}`, 'success');
                    return;
                  }

                  // Save first without blocking on connect (npx installs can hang).
                  const server = await mcp.addServer({
                    ...data,
                    connectNow: false });
                  setDialogMode(null);
                  showToast(`Added ${data.name}`, 'success');
                  await mcp.refresh();
                  // Best-effort connect in the background
                  void mcp.connect(server.id).catch(() => undefined);
                }}
 />
            )}
          </AnimatePresence>
    </div>
  );
}
