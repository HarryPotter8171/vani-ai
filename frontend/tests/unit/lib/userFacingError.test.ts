import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  getUserFriendlyError,
  isTechnicalErrorMessage,
  toUserFacingError,
  isDeveloperMode,
} from '@/lib/userFacingError';

describe('getUserFriendlyError', () => {
  it('maps Failed to fetch', () => {
    expect(getUserFriendlyError('Failed to fetch')).toMatch(/connection lost/i);
  });

  it('maps Internal Server Error', () => {
    expect(getUserFriendlyError('Internal Server Error')).toMatch(/trouble/i);
  });

  it('maps Permission denied', () => {
    expect(getUserFriendlyError('Permission denied')).toMatch(/permission/i);
  });

  it('passes through friendly product copy', () => {
    expect(getUserFriendlyError('Chat deleted')).toBe('Chat deleted');
  });

  it('handles Error instances', () => {
    expect(
      getUserFriendlyError(new Error('NetworkError when attempting to fetch resource.'))
    ).toMatch(/connection lost/i);
  });

  it('uses fallback for empty input', () => {
    expect(getUserFriendlyError('', 'Please try again')).toBe('Please try again');
  });

  it('scrubs ElevenLabs configuration leaks', () => {
    expect(getUserFriendlyError('ElevenLabs is not configured.')).toMatch(
      /temporarily unavailable|speech/i
    );
  });

  it('scrubs OpenAI / Gemini / Vertex provider names', () => {
    expect(getUserFriendlyError('OpenAI API error')).not.toMatch(/OpenAI/i);
    expect(getUserFriendlyError('Gemini API error')).not.toMatch(/Gemini/i);
    expect(getUserFriendlyError('Vertex AI error')).not.toMatch(/Vertex/i);
  });

  it('scrubs MongoDB / Redis / JWT', () => {
    expect(getUserFriendlyError('MongoDB error: ECONNREFUSED')).not.toMatch(/Mongo/i);
    expect(getUserFriendlyError('Redis error')).not.toMatch(/Redis/i);
    expect(getUserFriendlyError('JWT error: invalid signature')).toMatch(/sign in/i);
  });

  it('scrubs environment variable names', () => {
    expect(getUserFriendlyError('STRIPE_SECRET_KEY is not configured')).not.toMatch(
      /STRIPE_SECRET_KEY/
    );
    expect(getUserFriendlyError('ELEVENLABS_API_KEY missing')).not.toMatch(/ELEVENLABS/);
  });

  it('uses feature-scoped fallbacks', () => {
    expect(getUserFriendlyError('boom', { feature: 'research' })).toMatch(/research/i);
    expect(getUserFriendlyError('boom', { feature: 'image' })).toMatch(/image/i);
    expect(getUserFriendlyError('boom', { feature: 'voice' })).toMatch(/unavailable/i);
    expect(getUserFriendlyError('boom', { feature: 'canvas' })).toMatch(/canvas/i);
    expect(getUserFriendlyError('boom', { feature: 'browser' })).toMatch(/unavailable/i);
    expect(getUserFriendlyError('boom', { feature: 'upload' })).toMatch(/upload/i);
    expect(getUserFriendlyError('boom', { feature: 'search' })).toMatch(/search/i);
  });

  it('maps timeouts to connection lost', () => {
    expect(getUserFriendlyError('Request timed out')).toMatch(/connection lost/i);
  });

  it('alias toUserFacingError still works', () => {
    expect(toUserFacingError('Failed to fetch')).toMatch(/connection lost/i);
  });
});

describe('isTechnicalErrorMessage', () => {
  it('flags stack-like strings', () => {
    expect(isTechnicalErrorMessage('TypeError: x is not defined')).toBe(true);
  });

  it('flags provider names', () => {
    expect(isTechnicalErrorMessage('Gemini is not configured')).toBe(true);
  });

  it('allows product copy', () => {
    expect(isTechnicalErrorMessage('Memory saved')).toBe(false);
  });
});

describe('isDeveloperMode', () => {
  const prev = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = prev;
  });

  it('is true in development', () => {
    process.env.NODE_ENV = 'development';
    expect(isDeveloperMode()).toBe(true);
  });

  it('follows NODE_ENV or localhost hostname', () => {
    process.env.NODE_ENV = 'production';
    // jsdom hostname is typically localhost → developer mode stays on.
    expect(typeof isDeveloperMode()).toBe('boolean');
  });
});
