import { describe, expect, it } from 'vitest';
import { buildSmartSuggestions, buildRecommendations } from '@/lib/suggestions';
import type { Project, ChatSummary } from '@/lib/types';
import type { MemoryItem } from '@/lib/memory';

const project: Project = {
  _id: 'p1',
  name: 'Launch VANI',
  description: 'Premium AI OS',
};

const chats: ChatSummary[] = [
  {
    id: 'c1',
    title: 'Image system polish',
    lastMessage: 'Let’s refine the edit pipeline',
    updatedAt: new Date().toISOString(),
  },
];

const memories: MemoryItem[] = [
  {
    id: 'm1',
    userId: 'u1',
    category: 'goal',
    content: 'Ship Phase 3 this week',
    key: null,
    importance: 0.9,
    source: 'manual',
    chatId: null,
  },
];

describe('buildSmartSuggestions', () => {
  it('prioritizes project and memory context over defaults', () => {
    const suggestions = buildSmartSuggestions({
      hour: 9,
      activeProject: project,
      recentChats: chats,
      recentProjects: [project],
      memories,
      limit: 6,
    });

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.length).toBeLessThanOrEqual(6);
    expect(suggestions.some((s) => s.source === 'project')).toBe(true);
    expect(suggestions.some((s) => s.source === 'memory' || s.source === 'time')).toBe(
      true
    );
  });

  it('returns time-based suggestions in the morning', () => {
    const suggestions = buildSmartSuggestions({ hour: 8, limit: 6 });
    expect(suggestions.some((s) => s.source === 'time')).toBe(true);
  });

  it('builds recommendations from the same context', () => {
    const recs = buildRecommendations({
      hour: 14,
      activeProject: project,
      recentChats: chats,
    });
    expect(recs.length).toBeGreaterThan(0);
    expect(recs[0].prompt.length).toBeGreaterThan(10);
  });
});
