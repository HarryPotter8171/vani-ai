'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL, USER_EMAIL, USER_NAME } from '@/lib/constants';
import type { ChatSummary, Project, ProjectFile, ProjectMemory } from '@/lib/types';

function withUser(body: Record<string, unknown> = {}) {
  return { ...body, userEmail: USER_EMAIL, userName: USER_NAME };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
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
      const query = new URLSearchParams({ email: USER_EMAIL });
      if (q) query.set('q', q);
      const data = await api<Project[]>(`/projects?${query}`);
      setProjects(data);
      return data;
    } catch (err) {
      setError((err as Error).message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshProjectChats = useCallback(
    async (projectId: string, q = '') => {
      const query = new URLSearchParams({ email: USER_EMAIL });
      if (q) query.set('q', q);
      const data = await api<Array<{ _id: string; title: string; lastMessage?: string; updatedAt?: string }>>(
        `/projects/${projectId}/chats?${query}`
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

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  useEffect(() => {
    if (activeProjectId) void refreshProjectChats(activeProjectId);
    else setProjectChats([]);
  }, [activeProjectId, refreshProjectChats]);

  const selectProject = useCallback(async (projectId: string | null) => {
    setActiveProjectId(projectId);
    if (projectId) {
      await api(`/projects/${projectId}?email=${encodeURIComponent(USER_EMAIL)}`);
    }
  }, []);

  const createProject = useCallback(
    async (payload: { name: string; description?: string; instructions?: string; systemPrompt?: string }) => {
      const project = await api<Project>('/projects', {
        method: 'POST',
        body: JSON.stringify(withUser(payload)),
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
        body: JSON.stringify(withUser({ name })),
      });
      await refreshProjects();
    },
    [refreshProjects]
  );

  const updateProject = useCallback(
    async (projectId: string, patch: Partial<Project>) => {
      await api(`/projects/${projectId}`, {
        method: 'PUT',
        body: JSON.stringify(withUser(patch)),
      });
      await refreshProjects();
    },
    [refreshProjects]
  );

  const deleteProject = useCallback(
    async (projectId: string) => {
      await api(`/projects/${projectId}?email=${encodeURIComponent(USER_EMAIL)}`, {
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
        body: JSON.stringify(withUser()),
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
        body: JSON.stringify(withUser()),
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
        body: JSON.stringify(withUser()),
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
        body: JSON.stringify(withUser({ file })),
      });
      await refreshProjects();
      return saved;
    },
    [refreshProjects]
  );

  const listMemories = useCallback(async (projectId: string) => {
    return api<{ categories: string[]; memories: ProjectMemory[] }>(
      `/projects/${projectId}/memories?email=${encodeURIComponent(USER_EMAIL)}`
    );
  }, []);

  const saveMemory = useCallback(
    async (
      projectId: string,
      memory: { category: string; key: string; value: string }
    ) => {
      return api<ProjectMemory>(`/projects/${projectId}/memories`, {
        method: 'POST',
        body: JSON.stringify(withUser(memory)),
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
    selectProject,
    createProject,
    renameProject,
    updateProject,
    deleteProject,
    duplicateProject,
    archiveProject,
    pinProject,
    uploadKnowledgeFile,
    listMemories,
    saveMemory,
  };
}
