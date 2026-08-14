import { describe, expect, it } from 'vitest';
import { shouldAutoOpenCanvasFromMessage } from '@/lib/canvas/detect';

describe('shouldAutoOpenCanvasFromMessage', () => {
  it('never auto-opens from length or artifacts', () => {
    expect(shouldAutoOpenCanvasFromMessage('x'.repeat(5000), [])).toBe(false);
    expect(
      shouldAutoOpenCanvasFromMessage('hi', [
        {
          id: 'a1',
          messageId: 'm1',
          index: 0,
          title: 'Code',
          language: 'javascript',
          content: 'console.log(1)',
          isStreaming: false,
        },
      ])
    ).toBe(false);
  });

  it('never auto-opens from document-like prompts either', () => {
    expect(
      shouldAutoOpenCanvasFromMessage(
        '# Article\n\nWrite an essay about bees and open in canvas.',
        []
      )
    ).toBe(false);
  });
});
