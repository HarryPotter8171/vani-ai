/** Client-side image prep for Gemini Vision — resize, compress, normalize MIME. */

export const VISION_MAX_EDGE = 2048;
export const VISION_JPEG_QUALITY = 0.86;
export const VISION_IMAGE_ACCEPT = 'image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp';

export function normalizeImageMime(mime: string): string {
  const m = (mime || '').toLowerCase();
  if (m === 'image/jpg') return 'image/jpeg';
  if (m === 'image/jpeg' || m === 'image/png' || m === 'image/webp') return m;
  return 'image/jpeg';
}

export function isVisionImageFile(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  if (mime.startsWith('image/')) {
    return ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(mime);
  }
  return /\.(jpe?g|png|webp)$/i.test(file.name);
}

function blobToBase64(blob: Blob, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const onAbort = () => {
      reader.abort();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    reader.onload = () => {
      signal?.removeEventListener('abort', onAbort);
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to encode image'));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => {
      signal?.removeEventListener('abort', onAbort);
      reject(reader.error ?? new Error('Failed to encode image'));
    };
    reader.readAsDataURL(blob);
  });
}

function pickOutputMime(file: File, hasAlpha: boolean): string {
  const src = normalizeImageMime(file.type || 'image/jpeg');
  // Keep PNG when transparency matters (UI screenshots, diagrams).
  if (hasAlpha && src === 'image/png') return 'image/png';
  if (src === 'image/webp' && file.size < 1.5 * 1024 * 1024) return 'image/webp';
  // Camera / photo path → JPEG for size.
  return 'image/jpeg';
}

function extensionForMime(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

export interface OptimizedVisionImage {
  dataBase64: string;
  mimeType: string;
  size: number;
  previewUrl: string;
  name: string;
  width: number;
  height: number;
}

/**
 * Downscale large camera photos / screenshots and compress for Vision.
 * Falls back to the original bytes if canvas processing fails.
 */
export async function optimizeImageForVision(
  file: File,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<OptimizedVisionImage> {
  onProgress?.(8);

  try {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const bitmap = await createImageBitmap(file);
    onProgress?.(28);

    const scale = Math.min(1, VISION_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) {
      bitmap.close();
      throw new Error('Canvas unavailable');
    }

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    onProgress?.(55);

    // Detect alpha usage (UI screenshots / transparent PNGs).
    let hasAlpha = false;
    if ((file.type || '').toLowerCase() === 'image/png') {
      try {
        const sample = ctx.getImageData(0, 0, Math.min(width, 64), Math.min(height, 64)).data;
        for (let i = 3; i < sample.length; i += 4) {
          if (sample[i] < 250) {
            hasAlpha = true;
            break;
          }
        }
      } catch {
        // Assume PNG may need alpha if we can't sample.
        hasAlpha = true;
      }
    }

    const mimeType = pickOutputMime(file, hasAlpha);
    const quality = mimeType === 'image/jpeg' ? VISION_JPEG_QUALITY : undefined;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Image encode failed'))),
        mimeType,
        quality
      );
    });

    onProgress?.(78);
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const dataBase64 = await blobToBase64(blob, signal);
    onProgress?.(96);

    const baseName = file.name?.replace(/\.[^.]+$/, '') || `photo-${Date.now()}`;
    const name = `${baseName}.${extensionForMime(mimeType)}`;
    const previewUrl = URL.createObjectURL(blob);

    onProgress?.(100);
    return {
      dataBase64,
      mimeType,
      size: blob.size,
      previewUrl,
      name,
      width,
      height,
    };
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;

    // Fallback: send original bytes without canvas processing.
    onProgress?.(40);
    const dataBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      const onAbort = () => {
        reader.abort();
        reject(new DOMException('Aborted', 'AbortError'));
      };
      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener('abort', onAbort, { once: true });
      reader.onload = () => {
        signal?.removeEventListener('abort', onAbort);
        const result = reader.result;
        if (typeof result !== 'string') {
          reject(new Error('Failed to read image'));
          return;
        }
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => {
        signal?.removeEventListener('abort', onAbort);
        reject(reader.error ?? new Error('Failed to read image'));
      };
      reader.readAsDataURL(file);
    });
    onProgress?.(100);
    return {
      dataBase64,
      mimeType: normalizeImageMime(file.type || 'image/jpeg'),
      size: file.size,
      previewUrl: URL.createObjectURL(file),
      name: file.name || `photo-${Date.now()}.jpg`,
      width: 0,
      height: 0,
    };
  }
}

/** Ensure clipboard / camera blobs have a usable filename. */
export function ensureImageFileName(file: File, source: 'paste' | 'camera' | 'upload' = 'upload'): File {
  if (file.name && file.name !== 'image.png' && file.name !== 'blob') return file;
  const mime = normalizeImageMime(file.type || 'image/png');
  const ext = extensionForMime(mime);
  const prefix = source === 'paste' ? 'pasted-image' : source === 'camera' ? 'camera' : 'image';
  return new File([file], `${prefix}-${Date.now()}.${ext}`, {
    type: mime,
    lastModified: file.lastModified || Date.now(),
  });
}
