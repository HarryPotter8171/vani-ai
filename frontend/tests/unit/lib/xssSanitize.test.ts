import { describe, expect, it } from 'vitest';
import {
  safeHref,
  safeUrl,
  markdownUrlTransform,
  isRenderableImageSrc,
  stripHallucinatedImageMarkdown,
} from '@/lib/safeUrl';
import { sanitizeRichtextHtmlSafe } from '@/lib/richtextSanitize';

describe('safeUrl', () => {
  it('returns null for empty / relative / invalid', () => {
    expect(safeUrl(undefined)).toBeNull();
    expect(safeUrl(null)).toBeNull();
    expect(safeUrl('')).toBeNull();
    expect(safeUrl('   ')).toBeNull();
    expect(safeUrl('/api')).toBeNull();
    expect(safeUrl('not a url')).toBeNull();
  });

  it('parses absolute http(s) URLs', () => {
    expect(safeUrl('https://example.com/api')?.origin).toBe('https://example.com');
    expect(safeUrl('ws://127.0.0.1:5001/api')?.protocol).toBe('ws:');
  });
});

describe('safeHref / markdownUrlTransform', () => {
  it('allows http, https, mailto', () => {
    expect(safeHref('https://example.com/a')).toBe('https://example.com/a');
    expect(safeHref('http://example.com')).toBe('http://example.com');
    expect(safeHref('mailto:user@example.com')).toBe('mailto:user@example.com');
  });

  it('allows relative and hash links', () => {
    expect(safeHref('/share/abc')).toBe('/share/abc');
    expect(safeHref('#section')).toBe('#section');
  });

  it('rejects javascript: and data: schemes', () => {
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref('JAVASCRIPT:alert(1)')).toBeUndefined();
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeUndefined();
    expect(safeHref('vbscript:msgbox(1)')).toBeUndefined();
  });

  it('urlTransform returns empty string for dangerous URLs', () => {
    expect(markdownUrlTransform('javascript:alert(1)')).toBe('');
    expect(markdownUrlTransform('https://ok.example')).toBe('https://ok.example');
  });
});

describe('isRenderableImageSrc', () => {
  it('allows http(s) and same-origin relative paths', () => {
    expect(isRenderableImageSrc('https://cdn.example/a.png')).toBe(
      'https://cdn.example/a.png'
    );
    expect(isRenderableImageSrc('/api/files/abc')).toBe('/api/files/abc');
  });

  it('rejects data URLs, raw base64, and nonsense', () => {
    expect(
      isRenderableImageSrc('data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==')
    ).toBeUndefined();
    expect(
      isRenderableImageSrc(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
      )
    ).toBeUndefined();
    expect(isRenderableImageSrc('ARIENYwardrobe')).toBeUndefined();
    expect(isRenderableImageSrc('mailto:x@y.com')).toBeUndefined();
    expect(isRenderableImageSrc('')).toBeUndefined();
  });
});

describe('stripHallucinatedImageMarkdown', () => {
  it('removes base64 dumps and invalid markdown images; keeps http(s) images', () => {
    const input = [
      'Here is a wardrobe.',
      '![Image 1: A wardrobe](data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==)',
      '![ok](https://cdn.example/a.png)',
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'More text.',
    ].join('\n');
    const out = stripHallucinatedImageMarkdown(input);
    expect(out).toContain('Here is a wardrobe.');
    expect(out).toContain('More text.');
    expect(out).toContain('![ok](https://cdn.example/a.png)');
    expect(out).not.toMatch(/Image 1: A wardrobe/);
    expect(out).not.toMatch(/data:image/i);
    expect(out).not.toMatch(/iVBORw0KGgo/);
  });
});

describe('sanitizeRichtextHtmlSafe', () => {
  it('strips script tags and event handlers', () => {
    const dirty =
      '<p>Hello</p><script>alert(1)</script><img src=x onerror="alert(2)" /><a href="javascript:alert(3)">x</a>';
    const clean = sanitizeRichtextHtmlSafe(dirty);
    expect(clean).not.toMatch(/<script/i);
    expect(clean).not.toMatch(/onerror/i);
    expect(clean).not.toMatch(/javascript:/i);
    expect(clean).toMatch(/Hello/);
  });

  it('preserves safe formatting', () => {
    const clean = sanitizeRichtextHtmlSafe('<p><strong>Bold</strong> and <em>italic</em></p>');
    expect(clean).toContain('<strong>');
    expect(clean).toContain('<em>');
  });

  it('adds noopener on target=_blank anchors', () => {
    const clean = sanitizeRichtextHtmlSafe(
      '<a href="https://example.com" target="_blank">Go</a>'
    );
    expect(clean).toMatch(/rel="noopener noreferrer"/);
  });
});
