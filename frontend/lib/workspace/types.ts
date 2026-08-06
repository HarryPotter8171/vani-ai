/**
 * VANI AI Workspace OS — client-side workspace model.
 * No backend contract changes; coordinates existing panels & surfaces.
 */

export type WorkspaceTab =
  | 'chat'
  | 'canvas'
  | 'files'
  | 'research'
  | 'memory'
  | 'tasks'
  | 'automation';

export type ContextSurface =
  | 'conversation'
  | 'canvas'
  | 'files'
  | 'research'
  | 'memory'
  | 'tasks'
  | 'agents'
  | 'project'
  | 'automation';

export type DockAction =
  | 'files'
  | 'research'
  | 'canvas'
  | 'memory'
  | 'agents'
  | 'images'
  | 'voice';

export type DropActionId =
  | 'attach'
  | 'knowledge'
  | 'summarize'
  | 'research'
  | 'image';

export interface WorkspaceTask {
  id: string;
  title: string;
  done: boolean;
  createdAt: string;
  projectId?: string | null;
}

export const WORKSPACE_TABS: {
  id: WorkspaceTab;
  label: string;
}[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'canvas', label: 'Canvas' },
  { id: 'files', label: 'Files' },
  { id: 'research', label: 'Research' },
  { id: 'memory', label: 'Memory' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'automation', label: 'Automation' },
];

export const PROJECT_WORKSPACE_ITEMS: {
  id: 'chat' | 'files';
  label: string;
}[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'files', label: 'Files' },
];

export const DOCK_ITEMS: {
  id: DockAction;
  label: string;
}[] = [
  { id: 'files', label: 'Files' },
  { id: 'research', label: 'Research' },
  { id: 'canvas', label: 'Canvas' },
  { id: 'memory', label: 'Memory' },
  { id: 'agents', label: 'Agents' },
  { id: 'images', label: 'Images' },
  { id: 'voice', label: 'Voice' },
];
