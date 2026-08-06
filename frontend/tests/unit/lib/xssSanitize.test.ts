import { describe, expect, it } from 'vitest';
import { safeHref, safeUrl, markdownUrlTransform } from '@/lib/safeUrl';
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
