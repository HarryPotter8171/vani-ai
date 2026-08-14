'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/apiClient';
import type { ChatSummary, Project, ProjectFile, ProjectMemory } from '@/lib/types';
import { getUserFriendlyError } from '@/lib/userFacingError';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${response.status})`);
  }
  return response.json();
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectChats, setProjectChats] = useState<ChatSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeProject = projects.find((p) => p._id === activeProjectId) ?? null;

  const refreshProjects = useCallback(async (q = '') => {
    setIsLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      if (q) query.set('q', q);
      const path = query.toString() ? `/projects?${query}` : '/projects';
      const data = await api<Project[]>(path);
      setProjects(data);
      return data;
    } catch (err) {
      setError(getUserFriendlyError(err, { fallback: "Couldn't load projects" }));
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshProjectChats = useCallback(
    async (projectId: string, q = '') => {
      const query = new URLSearchParams();
      if (q) query.set('q', q);
      const path = query.toString()
        ? `/projects/${projectId}/chats?${query}`
        : `/projects/${projectId}/chats`;
      const data = await api<Array<{ _id: string; title: string; lastMessage?: string; updatedAt?: string }>>(
        path
      );
      const mapped: ChatSummary[] = data.map((c) => ({
        id: c._id,
        title: c.title,
        lastMessage: c.lastMessage,
        updatedAt: c.updatedAt,
        project: projectId,
      }));
      setProjectChats(mapped);
      return mapped;
    },
    []
  );

  // Local-only patch, mirrors useChatHistory's updateChatTitle — lets a
  // project's chat list reflect an auto-generated title instantly.
  const updateProjectChatTitle = useCallback((chatId: string, title: string) => {
    setProjectChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, title } : c)));
  }, []);

  useEffect(() => {
    // Defer so the effect itself doesn't synchronously call setState.
    const timer = window.setTimeout(() => {
      void refreshProjects();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshProjects]);

  useEffect(() => {
    if (!activeProjectId) {
      const timer = window.setTimeout(() => setProjectChats([]), 0);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => {
      void refreshProjectChats(activeProjectId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeProjectId, refreshProjectChats]);

  const selectProject = useCallback(async (projectId: string | null) => {
    setActiveProjectId(projectId);
    if (projectId) {
      await api(`/projects/${projectId}`);
    }
  }, []);

  const createProject = useCallback(
    async (payload: { name: string; description?: string; instructions?: string; systemPrompt?: string }) => {
      const project = await api<Project>('/projects', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await refreshProjects();
      setActiveProjectId(project._id);
      return project;
    },
    [refreshProjects]
  );

  const renameProject = useCallback(
    async (projectId: string, name: string) => {
      await api(`/projects/${projectId}/rename`, {
        method: 'PUT',
        body: JSON.stringify({ name }),
      });
      await refreshProjects();
    },
    [refreshProjects]
  );

  const updateProject = useCallback(
    async (projectId: string, patch: Partial<Project>) => {
      await api(`/projects/${projectId}`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
      await refreshProjects();
    },
    [refreshProjects]
  );

  const deleteProject = useCallback(
    async (projectId: string) => {
      await api(`/projects/${projectId}`, {
        method: 'DELETE',
      });
      if (activeProjectId === projectId) setActiveProjectId(null);
      await refreshProjects();
    },
    [activeProjectId, refreshProjects]
  );

  const duplicateProject = useCallback(
    async (projectId: string) => {
      const copy = await api<Project>(`/projects/${projectId}/duplicate`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await refreshProjects();
      setActiveProjectId(copy._id);
      return copy;
    },
    [refreshProjects]
  );

  const archiveProject = useCallback(
    async (projectId: string) => {
      await api(`/projects/${projectId}/archive`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (activeProjectId === projectId) setActiveProjectId(null);
      await refreshProjects();
    },
    [activeProjectId, refreshProjects]
  );

  const pinProject = useCallback(
    async (projectId: string, pinned = true) => {
      await api(`/projects/${projectId}/${pinned ? 'pin' : 'unpin'}`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await refreshProjects();
    },
    [refreshProjects]
  );

  const uploadKnowledgeFile = useCallback(
    async (projectId: string, file: {
      name: string;
      mimeType: string;
      size: number;
      kind: string;
      dataBase64: string;
    }) => {
      const saved = await api<ProjectFile>(`/projects/${projectId}/files`, {
        method: 'POST',
        body: JSON.stringify({ file }),
      });
      await refreshProjects();
      return saved;
    },
    [refreshProjects]
  );

  const listFiles = useCallback(async (projectId: string) => {
    return api<ProjectFile[]>(`/projects/${projectId}/files`);
  }, []);

  const deleteFile = useCallback(
    async (projectId: string, fileId: string) => {
      await api(`/projects/${projectId}/files/${fileId}`, { method: 'DELETE' });
      await refreshProjects();
    },
    [refreshProjects]
  );

  const listMemories = useCallback(async (projectId: string) => {
    return api<{ categories: string[]; memories: ProjectMemory[] }>(
      `/projects/${projectId}/memories`
    );
  }, []);

  const saveMemory = useCallback(
    async (
      projectId: string,
      memory: { category: string; key: string; value: string }
    ) => {
      return api<ProjectMemory>(`/projects/${projectId}/memories`, {
        method: 'POST',
        body: JSON.stringify(memory),
      });
    },
    []
  );

  const pinnedProjects = projects.filter((p) => p.pinned && !p.archived);
  const recentProjects = projects.filter((p) => !p.archived);

  return {
    projects: recentProjects,
    pinnedProjects,
    activeProjectId,
    activeProject,
    projectChats,
    isLoading,
    error,
    refreshProjects,
    refreshProjectChats,
    updateProjectChatTitle,
    selectProject,
    createProject,
    renameProject,
    updateProject,
    deleteProject,
    duplicateProject,
    archiveProject,
    pinProject,
    uploadKnowledgeFile,
    listFiles,
    deleteFile,
    listMemories,
    saveMemory,
  };
}
