/**
 * Context-aware suggestion engine for Dynamic Home.
 * Pure functions — no network. Callers supply chats / projects / memories.
 */

import type { SuggestionCard } from '@/lib/constants';
import { SUGGESTION_CARDS } from '@/lib/constants';
import type { ChatSummary, Project } from '@/lib/types';
import type { MemoryItem } from '@/lib/memory';

export type SuggestionSource =
  | 'time'
  | 'project'
  | 'file'
  | 'memory'
  | 'context'
  | 'default';

export interface SmartSuggestion extends SuggestionCard {
  id: string;
  source: SuggestionSource;
  reason?: string;
}

export interface SuggestionContext {
  hour?: number;
  activeProject?: Project | null;
  recentChats?: ChatSummary[];
  recentProjects?: Project[];
  memories?: MemoryItem[];
  /** Project knowledge file names when available */
  knowledgeFiles?: string[];
  limit?: number;
}

function timeOfDay(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
  if (hour < 5) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

function timeSuggestions(hour: number): SmartSuggestion[] {
  const slot = timeOfDay(hour);
  const map: Record<typeof slot, SmartSuggestion[]> = {
    morning: [
      {
        id: 'time-morning-plan',
        title: 'Plan the day',
        description: 'Prioritize goals for today',
        icon: 'analyze',
        prompt:
          'Help me plan my day. Ask what matters most today, then propose a focused schedule with priorities.',
        source: 'time',
        reason: 'Morning focus',
      },
      {
        id: 'time-morning-brief',
        title: 'Morning brief',
        description: 'Catch up on what matters',
        icon: 'research',
        prompt:
          'Give me a concise morning brief: ask what I’m working on and summarize the smartest next steps.',
        source: 'time',
        reason: 'Start strong',
      },
    ],
    afternoon: [
      {
        id: 'time-afternoon-deep',
        title: 'Deep work block',
        description: 'Ship something meaningful',
        icon: 'code',
        prompt:
          'I have a deep work block this afternoon. Help me pick one high-leverage task and break it into clear steps.',
        source: 'time',
        reason: 'Afternoon energy',
      },
      {
        id: 'time-afternoon-draft',
        title: 'Draft & polish',
        description: 'Write with clarity',
        icon: 'canvas',
        prompt:
          'Open a canvas and help me draft a clear, polished piece of writing for what I’m working on.',
        source: 'time',
        reason: 'Midday create',
      },
    ],
    evening: [
      {
        id: 'time-evening-reflect',
        title: 'Reflect & wrap',
        description: 'Close the loop on today',
        icon: 'analyze',
        prompt:
          'Help me wrap up today: what went well, what to carry forward tomorrow, and one thing to let go.',
        source: 'time',
        reason: 'Evening wind-down',
      },
      {
        id: 'time-evening-learn',
        title: 'Learn something new',
        description: 'A short deep dive',
        icon: 'research',
        prompt:
          'Teach me something fascinating in 5 minutes — pick a topic adjacent to AI, product, or creative work and make it vivid.',
        source: 'time',
        reason: 'Evening curiosity',
      },
    ],
    night: [
      {
        id: 'time-night-calm',
        title: 'Calm creative',
        description: 'Low-pressure exploration',
        icon: 'image',
        prompt:
          'Create a calming, beautiful image inspired by quiet night light — soft, atmospheric, cinematic.',
        source: 'time',
        reason: 'Late night',
      },
      {
        id: 'time-night-voice',
        title: 'Talk it through',
        description: 'Voice brainstorm',
        icon: 'voice',
        prompt: 'Start a voice conversation — I want to brainstorm out loud without pressure.',
        source: 'time',
        reason: 'Night mode',
      },
    ],
  };
  return map[slot];
}

function projectSuggestions(project: Project): SmartSuggestion[] {
  const name = project.name.trim() || 'this project';
  const desc = (project.description || '').trim();
  const out: SmartSuggestion[] = [
    {
      id: `project-continue-${project._id}`,
      title: `Continue ${name}`,
      description: desc ? desc.slice(0, 72) : 'Pick up where you left off',
      icon: 'analyze',
      prompt: `We're working on the project "${name}".${
        desc ? ` Context: ${desc}.` : ''
      } Summarize the current state and suggest the best next action.`,
      source: 'project',
      reason: 'Active project',
    },
    {
      id: `project-plan-${project._id}`,
      title: 'Project plan',
      description: `Roadmap for ${name}`,
      icon: 'canvas',
      prompt: `Create a concise project plan for "${name}". Include goals, milestones, risks, and the next 3 actions.`,
      source: 'project',
      reason: 'Project focus',
    },
  ];
  return out;
}

function fileSuggestions(files: string[]): SmartSuggestion[] {
  if (!files.length) return [];
  const sample = files.slice(0, 3);
  const label = sample[0];
  const more = files.length > 1 ? ` (+${files.length - 1} more)` : '';
  return [
    {
      id: 'file-summarize',
      title: 'Analyze files',
      description: `${label}${more}`,
      icon: 'pdf',
      prompt: `I have knowledge files including: ${sample.join(', ')}. Summarize the key insights and how they should shape our next decisions.`,
      source: 'file',
      reason: 'From your files',
    },
    {
      id: 'file-qa',
      title: 'Ask your docs',
      description: 'Q&A over knowledge',
      icon: 'research',
      prompt: `Using my project knowledge (${sample.join(', ')}), answer questions grounded in those documents and cite what you use.`,
      source: 'file',
      reason: 'Knowledge base',
    },
  ];
}

function memorySuggestions(memories: MemoryItem[]): SmartSuggestion[] {
  const useful = memories
    .filter((m) => m.content?.trim())
    .sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))
    .slice(0, 4);
  if (!useful.length) return [];

  const top = useful[0];
  const snippet = top.content.trim().slice(0, 90);
  const out: SmartSuggestion[] = [
    {
      id: `memory-act-${top.id}`,
      title: 'Act on a memory',
      description: snippet,
      icon: 'analyze',
      prompt: `You previously remembered: "${top.content.trim()}". Use that context and help me take the most useful next step related to it.`,
      source: 'memory',
      reason: 'From memory',
    },
  ];

  const goal = useful.find((m) => m.category === 'goal' || m.category === 'task');
  if (goal) {
    out.push({
      id: `memory-goal-${goal.id}`,
      title: 'Advance a goal',
      description: goal.content.trim().slice(0, 72),
      icon: 'code',
      prompt: `My goal/task: "${goal.content.trim()}". Break it into concrete steps and help me execute the first one now.`,
      source: 'memory',
      reason: 'Saved goal',
    });
  }

  const pref = useful.find((m) => m.category === 'preference' || m.category === 'profile');
  if (pref) {
    out.push({
      id: `memory-pref-${pref.id}`,
      title: 'Personalize for me',
      description: 'Match your preferences',
      icon: 'voice',
      prompt: `Remember that: "${pref.content.trim()}". Suggest three things we could create together that fit that preference.`,
      source: 'memory',
      reason: 'Your preferences',
    });
  }

  return out;
}

function contextSuggestions(
  chats: ChatSummary[],
  projects: Project[]
): SmartSuggestion[] {
  const out: SmartSuggestion[] = [];
  const latest = chats.find((c) => c.title && !/^new chat$/i.test(c.title.trim()));
  if (latest) {
    out.push({
      id: `context-chat-${latest.id}`,
      title: 'Continue conversation',
      description: latest.title,
      icon: 'analyze',
      prompt: `Continue from my recent chat titled "${latest.title}".${
        latest.lastMessage
          ? ` Last note: ${latest.lastMessage.slice(0, 160)}`
          : ''
      } Propose the smartest next move.`,
      source: 'context',
      reason: 'Recent chat',
    });
  }

  const recentProject = projects[0];
  if (recentProject && !out.some((s) => s.source === 'project')) {
    out.push({
      id: `context-project-${recentProject._id}`,
      title: recentProject.name,
      description: 'Reopen this project thread',
      icon: 'canvas',
      prompt: `Let's continue work on "${recentProject.name}". Suggest what to tackle next and why.`,
      source: 'context',
      reason: 'Recent project',
    });
  }

  return out;
}

function defaultSuggestions(): SmartSuggestion[] {
  return SUGGESTION_CARDS.map((card, i) => ({
    ...card,
    id: `default-${i}-${card.title}`,
    source: 'default' as const,
  }));
}

const SOURCE_PRIORITY: Record<SuggestionSource, number> = {
  project: 0,
  memory: 1,
  file: 2,
  context: 3,
  time: 4,
  default: 5,
};

/**
 * Build a ranked, deduped list of smart suggestions for the home surface.
 */
export function buildSmartSuggestions(ctx: SuggestionContext = {}): SmartSuggestion[] {
  const hour = ctx.hour ?? new Date().getHours();
  const limit = ctx.limit ?? 6;

  const pool: SmartSuggestion[] = [
    ...(ctx.activeProject ? projectSuggestions(ctx.activeProject) : []),
    ...memorySuggestions(ctx.memories || []),
    ...fileSuggestions(ctx.knowledgeFiles || []),
    ...contextSuggestions(ctx.recentChats || [], ctx.recentProjects || []),
    ...timeSuggestions(hour),
    ...defaultSuggestions(),
  ];

  const seen = new Set<string>();
  const ranked = pool
    .sort((a, b) => SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source])
    .filter((s) => {
      const key = s.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return ranked.slice(0, limit);
}

/** AI recommendation blurbs derived from the same context (home rail). */
export function buildRecommendations(ctx: SuggestionContext = {}): {
  id: string;
  title: string;
  body: string;
  actionLabel: string;
  prompt: string;
}[] {
  const suggestions = buildSmartSuggestions({ ...ctx, limit: 3 });
  return suggestions.map((s) => ({
    id: `rec-${s.id}`,
    title: s.title,
    body: s.reason || s.description || 'Suggested for you',
    actionLabel: 'Try it',
    prompt: s.prompt,
  }));
}
