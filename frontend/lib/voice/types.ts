export type VoiceMode = 'push-to-talk' | 'hands-free';

/** Full-screen Live UI vs floating presence while the session keeps running. */
export type VoicePresentation = 'expanded' | 'minimized';

export type VoicePhase =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'muted'
  | 'error';

export interface VoiceOption {
  id: string;
  name: string;
  gender: string;
  style: string;
}

/** One turn inside a Live Mode Voice Session (not a chat bubble). */
export interface VoiceTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  at: string;
}

export interface VoiceSessionInfo {
  id: string;
  mode: VoiceMode;
  state: string;
  voice: string;
  speed: number;
  language: string;
  muted: boolean;
  chatId: string | null;
  projectId: string | null;
  turnCount: number;
}

export interface VoiceSettings {
  mode: VoiceMode;
  voice: string;
  speed: number;
  language: 'auto' | 'en' | 'hi' | 'hi-en';
  /** When false, AI audio is silenced (mic still works). */
  speakerOn: boolean;
  /** 0–1 playback volume. */
  volume: number;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  mode: 'hands-free',
  voice: 'Kore',
  speed: 1,
  language: 'auto',
  speakerOn: true,
  volume: 1,
};

export const FALLBACK_VOICES: VoiceOption[] = [
  { id: 'Kore', name: 'Kore', gender: 'female', style: 'clear, warm' },
  { id: 'Aoede', name: 'Aoede', gender: 'female', style: 'bright, expressive' },
  { id: 'Leda', name: 'Leda', gender: 'female', style: 'soft, calm' },
  { id: 'Zephyr', name: 'Zephyr', gender: 'female', style: 'airy, light' },
  { id: 'Puck', name: 'Puck', gender: 'male', style: 'upbeat, playful' },
  { id: 'Charon', name: 'Charon', gender: 'male', style: 'deep, steady' },
  { id: 'Fenrir', name: 'Fenrir', gender: 'male', style: 'strong, grounded' },
  { id: 'Orus', name: 'Orus', gender: 'male', style: 'smooth, narrative' },
];
