export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5001/api';

export type SuggestionCard = {
  title: string;
  prompt: string;
  description?: string;
  /** Lucide icon key resolved in EmptyState */
  icon?:
    | 'image'
    | 'research'
    | 'code'
    | 'canvas'
    | 'pdf'
    | 'video'
    | 'voice'
    | 'analyze';
};

export const SUGGESTION_CARDS: SuggestionCard[] = [
  {
    title: 'Create Image',
    description: 'Generate visuals from a prompt',
    icon: 'image',
    prompt: 'Create a beautiful image of a serene mountain landscape at sunrise',
  },
  {
    title: 'Research',
    description: 'Deep dive with sources',
    icon: 'research',
    prompt: 'Research the latest developments in artificial intelligence',
  },
  {
    title: 'Code',
    description: 'Write and debug software',
    icon: 'code',
    prompt: 'Write a clean, well-structured React component with TypeScript',
  },
  {
    title: 'Canvas',
    description: 'Open a creative workspace',
    icon: 'canvas',
    prompt: 'Open a canvas and help me draft a product one-pager',
  },
  {
    title: 'Analyze PDF',
    description: 'Extract insights from docs',
    icon: 'pdf',
    prompt: 'Summarize the key points from a PDF I’ll upload',
  },
  {
    title: 'Voice',
    description: 'Talk with VANI live',
    icon: 'voice',
    prompt: 'Start a voice conversation — I want to brainstorm out loud',
  },
];

/** @deprecated Prefer SUGGESTION_CARDS */
export const SUGGESTION_CHIPS = SUGGESTION_CARDS.map((c) => c.title);
