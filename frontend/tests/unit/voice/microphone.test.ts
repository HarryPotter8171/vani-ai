import { describe, expect, it } from 'vitest';
import {
  checkMicrophoneSupport,
  classifyMicrophoneError,
  micFailureMessage,
  micFailureTitle,
  pickMediaRecorderMimeType,
} from '@/lib/voice/microphone';

describe('classifyMicrophoneError', () => {
  it('maps NotAllowedError to denied', () => {
    const err = new DOMException('Permission denied', 'NotAllowedError');
    expect(classifyMicrophoneError(err)).toBe('denied');
  });

  it('maps NotFoundError to unavailable', () => {
    const err = new DOMException('Requested device not found', 'NotFoundError');
    expect(classifyMicrophoneError(err)).toBe('unavailable');
  });

  it('maps NotReadableError to unavailable', () => {
    const err = new DOMException('Could not start audio source', 'NotReadableError');
    expect(classifyMicrophoneError(err)).toBe('unavailable');
  });
});

describe('micFailure copy', () => {
  it('has titles for every reason', () => {
    for (const reason of [
      'allow',
      'denied',
      'blocked',
      'unavailable',
      'unsupported',
      'insecure',
    ] as const) {
      expect(micFailureTitle(reason).length).toBeGreaterThan(3);
      expect(micFailureMessage(reason).length).toBeGreaterThan(10);
    }
  });
});

describe('checkMicrophoneSupport', () => {
  it('returns a structured result in jsdom', () => {
    const result = checkMicrophoneSupport();
    expect(result).toHaveProperty('ok');
    expect(result).toHaveProperty('message');
  });
});

describe('pickMediaRecorderMimeType', () => {
  it('returns a string without throwing', () => {
    expect(typeof pickMediaRecorderMimeType()).toBe('string');
  });
});
