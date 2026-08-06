import { describe, it, expect } from 'vitest';
import {
  createEmptyResearchState,
  hydrateResearchStateFromSession,
  reduceResearchState,
} from '@/lib/research/types';

describe('reduceResearchState', () => {
  it('accumulates sources and timeline', () => {
    let state = createEmptyResearchState();
    state = reduceResearchState(state, {
      type: 'session_start',
      sessionId: 's1',
      query: 'AI chips',
    });
    state = reduceResearchState(state, {
      type: 'source',
      source: { title: 'A', url: 'https://a.example', score: 0.9 },
    });
    state = reduceResearchState(state, {
      type: 'timeline',
      entry: {
        id: 't1',
        at: 1,
        kind: 'search',
        label: 'Searching',
      },
    });

    expect(state.sessionId).toBe('s1');
    expect(state.query).toBe('AI chips');
    expect(state.sources).toHaveLength(1);
    expect(state.timeline).toHaveLength(1);
  });

  it('handles code_analysis when timeline analyze row is missing', () => {
    let state = createEmptyResearchState();
    state = reduceResearchState(state, {
      type: 'code_analysis',
      stdout: 'mean=42',
      progress: 86,
    });
    expect(state.progress).toBe(86);
    expect(state.timeline.some((e) => e.kind === 'analyze')).toBe(true);
  });

  it('marks cancelled / completed statuses', () => {
    let state = createEmptyResearchState();
    state = reduceResearchState(state, { type: 'cancelled', reason: 'Stopped' });
    expect(state.status).toBe('cancelled');
    state = reduceResearchState(state, {
      type: 'completed',
      report: '# Done',
      confidence: 0.8,
      citations: [{ id: 1, label: '[1]', title: 'T', url: 'https://t.example' }],
    });
    expect(state.status).toBe('completed');
    expect(state.report).toBe('# Done');
    expect(state.confidence).toBe(0.8);
    expect(state.citations).toHaveLength(1);
  });
});

describe('hydrateResearchStateFromSession', () => {
  it('maps a persisted cancelled session for resume chrome', () => {
    const state = hydrateResearchStateFromSession({
      id: 'sess-1',
      query: 'What is vanadium?',
      status: 'cancelled',
      progress: 42,
      phase: 'reading',
      sources: [{ title: 'Wiki', url: 'https://en.wikipedia.org' }],
      timeline: [
        { id: '1', at: 1, kind: 'phase', label: 'Reading' },
      ],
      chatId: 'chat-9',
      error: 'Cancelled by user',
    });

    expect(state.sessionId).toBe('sess-1');
    expect(state.status).toBe('cancelled');
    expect(state.progress).toBe(42);
    expect(state.sources).toHaveLength(1);
    expect(state.chatId).toBe('chat-9');
    expect(state.query).toBe('What is vanadium?');
  });

  it('returns empty state for null input', () => {
    expect(hydrateResearchStateFromSession(null).status).toBe('idle');
  });
});
