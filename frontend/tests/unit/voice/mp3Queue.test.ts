/**
 * Mp3PlaybackQueue — producer hold prevents premature idle between chunks.
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Mp3PlaybackQueue } from '@/lib/tts/mp3Queue';

describe('Mp3PlaybackQueue', () => {
  let playMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    playMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      'Audio',
      class {
        volume = 1;
        preload = '';
        src = '';
        pause = vi.fn();
        load = vi.fn();
        removeAttribute = vi.fn();
        addEventListener = vi.fn(
          (type: string, handler: EventListener) => {
            if (type === 'ended') {
              // Resolve immediately so drain can finish in tests.
              queueMicrotask(() => handler(new Event('ended')));
            }
          }
        );
        removeEventListener = vi.fn();
        play = playMock;
      }
    );
    vi.stubGlobal('URL', {
      createObjectURL: () => 'blob:test',
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not emit idle while expectMore is held', async () => {
    const onIdle = vi.fn();
    const queue = new Mp3PlaybackQueue({ onIdle });

    queue.expectMore();
    queue.enqueue(new Blob(['a'], { type: 'audio/mpeg' }));

    await vi.waitFor(() => {
      expect(playMock).toHaveBeenCalled();
    });
    // Drain finished but producer still held.
    await Promise.resolve();
    await Promise.resolve();
    expect(onIdle).not.toHaveBeenCalled();

    queue.releaseExpect();
    await Promise.resolve();
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('emits idle when queue empties with no producers', async () => {
    const onIdle = vi.fn();
    const queue = new Mp3PlaybackQueue({ onIdle });

    queue.enqueue(new Blob(['a'], { type: 'audio/mpeg' }));
    await vi.waitFor(() => expect(onIdle).toHaveBeenCalledTimes(1));
  });

  it('applies setVolume to the audio element', () => {
    const queue = new Mp3PlaybackQueue();
    queue.setVolume(0.4);
    queue.enqueue(new Blob(['a'], { type: 'audio/mpeg' }));
    expect(queue).toBeTruthy();
  });

  it('hasPendingWork is true while producers are held', () => {
    const queue = new Mp3PlaybackQueue();
    expect(queue.hasPendingWork).toBe(false);
    queue.expectMore();
    expect(queue.hasPendingWork).toBe(true);
    queue.releaseExpect();
    expect(queue.hasPendingWork).toBe(false);
  });
});
