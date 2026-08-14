'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ListTodo, Plus, Check, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SPRING } from '@/lib/motion';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PremiumEmpty } from '@/components/ui/PremiumEmpty';
import type { WorkspaceTask } from '@/lib/workspace/types';

const STORAGE_KEY = 'vani-workspace-tasks';

function loadTasks(): WorkspaceTask[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as WorkspaceTask[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTasks(tasks: WorkspaceTask[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    /* ignore */
  }
}

export interface TasksWorkspaceProps {
  projectId?: string | null;
  compact?: boolean;
  className?: string;
  onAskAi?: (prompt: string) => void;
}

export default function TasksWorkspace({
  projectId = null,
  compact,
  className,
  onAskAi,
}: TasksWorkspaceProps) {
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    setTasks(loadTasks());
  }, []);

  const persist = useCallback((next: WorkspaceTask[]) => {
    setTasks(next);
    saveTasks(next);
  }, []);

  const visible = tasks.filter((t) =>
    projectId ? t.projectId === projectId || !t.projectId : true
  );

  const addTask = () => {
    const title = draft.trim();
    if (!title) return;
    const task: WorkspaceTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title,
      done: false,
      createdAt: new Date().toISOString(),
      projectId,
    };
    persist([task, ...tasks]);
    setDraft('');
  };

  const toggle = (id: string) => {
    persist(tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  const remove = (id: string) => {
    persist(tasks.filter((t) => t.id !== id));
  };

  const openCount = visible.filter((t) => !t.done).length;

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="mb-3 flex items-center justify-between px-0.5">
        <div className="os-section-label px-0">Tasks</div>
        <span className="text-micro font-medium tabular-nums text-text-tertiary">
          {openCount} open
        </span>
      </div>

      <div className="mb-3 flex items-center gap-1.5">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addTask();
          }}
          placeholder="Add a task…"
          inputSize="sm"
          className="min-w-0 flex-1 rounded-[12px] border-border bg-surface-hover"
        />
        <Button
          type="button"
          variant="primary"
          size="md"
          onClick={addTask}
          aria-label="Add task"
          className="h-9 w-9 rounded-[12px] p-0 shadow-none hover:shadow-none"
        >
          <Plus size={15} strokeWidth={2.25} />
        </Button>
      </div>

      {visible.length === 0 ? (
        <PremiumEmpty
          size="sm"
          icon={ListTodo}
          title="No tasks yet"
          description="Capture to-dos for this workspace, or ask VANI to break a goal into steps."
          className="rounded-[16px] border border-dashed border-border py-7"
          action={
            onAskAi ? (
              <button
                type="button"
                onClick={() =>
                  onAskAi('Help me break my current goal into 3 concrete tasks.')
                }
                className="text-micro font-medium text-accent hover:underline"
              >
                Ask AI to plan tasks
              </button>
            ) : null
          }
        />
      ) : (
        <ul className={cn('space-y-1', compact && 'max-h-[280px] overflow-y-auto custom-scrollbar')}>
          <AnimatePresence initial={false}>
            {visible.map((task) => (
              <motion.li
                key={task.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={SPRING.soft}
                className="group flex items-center gap-2 rounded-[12px] px-2 py-2 hover:bg-surface-hover"
              >
                <button
                  type="button"
                  onClick={() => toggle(task.id)}
                  aria-label={task.done ? 'Mark incomplete' : 'Mark complete'}
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                    task.done
                      ? 'border-accent bg-accent text-text-on-accent'
                      : 'border-border text-transparent hover:border-accent/40'
                  )}
                >
                  <Check size={11} strokeWidth={2.5} />
                </button>
                <span
                  className={cn(
                    'min-w-0 flex-1 text-sm tracking-[-0.014em]',
                    task.done
                      ? 'text-text-tertiary line-through'
                      : 'text-foreground'
                  )}
                >
                  {task.title}
                </span>
                <button
                  type="button"
                  aria-label="Delete task"
                  onClick={() => remove(task.id)}
                  className="rounded-md p-1 text-text-tertiary opacity-0 hover:text-danger group-hover:opacity-100"
                >
                  <Trash2 size={12} />
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
