import { apiFetch } from '@/lib/apiClient';

const MP3_MIME = 'audio/mpeg';

export function canStreamMp3WithMse(): boolean {
  return (
    typeof MediaSource !== 'undefined' &&
    typeof MediaSource.isTypeSupported === 'function' &&
    MediaSource.isTypeSupported(MP3_MIME)
  );
}

/** POST /api/tts — backend proxies ElevenLabs; key never leaves the server. */
export async function fetchTtsStream(
  text: string,
  signal?: AbortSignal
): Promise<Response> {
  const response = await apiFetch('/tts', {
    method: 'POST',
    body: JSON.stringify({ text }),
    signal,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message =
      (body as { error?: string }).error || 'Speech synthesis failed';
    const err = new Error(message);
    (err as Error & { code?: string }).code = (body as { code?: string }).code;
    throw err;
  }
  return response;
}

/**
 * Consume an MP3 Response into a Blob, optionally starting HTMLAudioElement
 * playback as soon as MediaSource has the first chunk (low latency).
 */
export async function consumeMp3Response(
  response: Response,
  signal: AbortSignal,
  options: {
    audio?: HTMLAudioElement;
    onReady?: () => void;
  } = {}
): Promise<{ blob: Blob; objectUrl: string | null }> {
  const { audio, onReady } = options;

  if (!response.body || !canStreamMp3WithMse() || !audio) {
    const blob = await response.blob();
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    let objectUrl: string | null = null;
    if (audio) {
      objectUrl = URL.createObjectURL(blob);
      audio.src = objectUrl;
      onReady?.();
      await audio.play();
    }
    return { blob, objectUrl };
  }

  const mediaSource = new MediaSource();
  const mseUrl = URL.createObjectURL(mediaSource);
  audio.src = mseUrl;
  const chunks: BlobPart[] = [];

  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      try {
        if (mediaSource.readyState === 'open') mediaSource.endOfStream();
      } catch {
        /* ignore */
      }
      reject(new DOMException('Aborted', 'AbortError'));
    };

    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });

    mediaSource.addEventListener(
      'sourceopen',
      async () => {
        try {
          const sourceBuffer = mediaSource.addSourceBuffer(MP3_MIME);
          const reader = response.body!.getReader();
          let started = false;

          const waitUpdateEnd = () =>
            new Promise<void>((res, rej) => {
              const onEnd = () => {
                sourceBuffer.removeEventListener('updateend', onEnd);
                sourceBuffer.removeEventListener('error', onErr);
                res();
              };
              const onErr = () => {
                sourceBuffer.removeEventListener('updateend', onEnd);
                sourceBuffer.removeEventListener('error', onErr);
                rej(new Error('SourceBuffer error'));
              };
              sourceBuffer.addEventListener('updateend', onEnd);
              sourceBuffer.addEventListener('error', onErr);
            });

          while (true) {
            if (signal.aborted) break;
            const { done, value } = await reader.read();
            if (done) break;
            if (!value?.byteLength) continue;
            const copy = value.slice();
            chunks.push(copy);
            if (sourceBuffer.updating) await waitUpdateEnd();
            sourceBuffer.appendBuffer(copy);
            await waitUpdateEnd();
            if (!started) {
              started = true;
              onReady?.();
              try {
                await audio.play();
              } catch {
                /* autoplay may need a later nudge */
              }
            }
          }

          if (signal.aborted) {
            onAbort();
            return;
          }

          if (mediaSource.readyState === 'open') {
            if (sourceBuffer.updating) await waitUpdateEnd();
            mediaSource.endOfStream();
          }

          if (!started) {
            onReady?.();
            await audio.play();
          } else if (audio.paused && !audio.ended) {
            // Don't auto-resume if the user paused mid-stream.
          }

          signal.removeEventListener('abort', onAbort);
          resolve();
        } catch (err) {
          signal.removeEventListener('abort', onAbort);
          reject(err);
        }
      },
      { once: true }
    );
  });

  return {
    blob: new Blob(chunks, { type: MP3_MIME }),
    objectUrl: mseUrl,
  };
}

/** One-shot ElevenLabs playback for Live Mode fallback (no speechSynthesis). */
export async function playElevenLabsOnce(
  text: string,
  options: {
    signal?: AbortSignal;
    volume?: number;
    cancelled?: () => boolean;
  } = {}
): Promise<boolean> {
  const clean = text.trim();
  if (!clean) return false;
  if (options.cancelled?.()) return false;

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  options.signal?.addEventListener('abort', onAbort, { once: true });

  const audio = new Audio();
  audio.preload = 'auto';
  audio.volume = Math.min(1, Math.max(0, options.volume ?? 1));
  let objectUrl: string | null = null;

  try {
    const response = await fetchTtsStream(clean, controller.signal);
    if (options.cancelled?.()) return false;

    const result = await consumeMp3Response(response, controller.signal, {
      audio,
      onReady: () => undefined,
    });
    objectUrl = result.objectUrl;

    if (options.cancelled?.()) return false;

    await new Promise<void>((resolve, reject) => {
      if (options.cancelled?.() || controller.signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      const cleanup = () => {
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('error', onError);
        controller.signal.removeEventListener('abort', onLocalAbort);
      };
      const onEnded = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error('Audio playback failed'));
      };
      const onLocalAbort = () => {
        cleanup();
        reject(new DOMException('Aborted', 'AbortError'));
      };
      audio.addEventListener('ended', onEnded);
      audio.addEventListener('error', onError);
      controller.signal.addEventListener('abort', onLocalAbort, { once: true });
      if (audio.ended) {
        cleanup();
        resolve();
      }
    });
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return false;
    if (options.cancelled?.()) return false;
    throw err;
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
