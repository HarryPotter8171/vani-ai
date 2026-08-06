import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeTranscript,
  isDuplicateTranscript,
  __resetSpeechRecognitionSingletonForTests,
} from '@/lib/voice/speechRecognition';
import {
  extractSpeakableChunks,
  stripMarkdownForSpeech,
  SENTENCE_PAUSE_SEC,
} from '@/lib/voice/audioPlayback';

describe('voice speech helpers', () => {
  it('strips markdown for natural speech', () => {
    const out = stripMarkdownForSpeech('Hello **world** with `code` and [link](https://x.com)');
    expect(out).toBe('Hello world with code and link');
  });

  it('splits English + Hindi sentence boundaries', () => {
    const { speakable, rest } = extractSpeakableChunks(
      'Hello there friend. Namaste doston। More text'
    );
    expect(speakable.length).toBeGreaterThanOrEqual(1);
    expect(speakable[0]).toMatch(/Hello there friend/);
    expect(rest).toContain('More text');
  });

  it('flushes remaining text when force=true', () => {
    const { speakable, rest } = extractSpeakableChunks('short bit', { force: true });
    expect(speakable).toEqual(['short bit']);
    expect(rest).toBe('');
  });

  it('starts TTS earlier with lower minChars default', () => {
    const { speakable } = extractSpeakableChunks('Yes it works. And more');
    expect(speakable[0]).toMatch(/Yes it works/);
  });

  it('exposes a short natural sentence pause', () => {
    expect(SENTENCE_PAUSE_SEC).toBeGreaterThan(0.02);
    expect(SENTENCE_PAUSE_SEC).toBeLessThan(0.12);
  });

  it('flushes mid-clause early for lower first-audio latency', () => {
    const long =
      'This is a fairly long clause without terminal punctuation yet, still going';
    const { speakable } = extractSpeakableChunks(long);
    expect(speakable.length).toBeGreaterThanOrEqual(1);
  });
});

describe('transcript dedupe', () => {
  beforeEach(() => {
    __resetSpeechRecognitionSingletonForTests();
  });

  it('normalizes case and punctuation', () => {
    expect(normalizeTranscript('Hello, World!')).toBe('hello world');
  });

  it('detects exact duplicates', () => {
    expect(isDuplicateTranscript('Hello world', 'hello world')).toBe(true);
  });

  it('detects containment duplicates from segmented finals', () => {
    expect(
      isDuplicateTranscript('search for elon musk', 'search for elon musk please')
    ).toBe(true);
  });

  it('respects dedupe time window when provided', () => {
    expect(
      isDuplicateTranscript('same', 'same', { aAt: 1000, bAt: 1200, windowMs: 500 })
    ).toBe(true);
    expect(
      isDuplicateTranscript('same', 'same', { aAt: 1000, bAt: 5000, windowMs: 500 })
    ).toBe(false);
  });

  it('does not mark unrelated phrases as duplicates', () => {
    expect(isDuplicateTranscript('open youtube', 'book a flight')).toBe(false);
  });
});
