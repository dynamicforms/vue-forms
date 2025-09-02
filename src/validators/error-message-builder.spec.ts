import { describe, expect, it, beforeEach, vi } from 'vitest';

import { buildErrorMessage } from './error-message-builder';
import { MdString } from './validation-error';

// Mock config module
vi.mock('../config', () => ({
  getConfig: vi.fn(),
  setConfig: vi.fn(),
}));

describe('buildErrorMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when useMarkdownInValidators is true', () => {
    beforeEach(async () => {
      const { getConfig } = await import('../config');
      vi.mocked(getConfig).mockReturnValue({ useMarkdownInValidators: true });
    });

    it('returns MdString instance for markdown content', () => {
      const markdownText = '**Bold** text with *italic*';
      const result = buildErrorMessage(markdownText);

      expect(result).toBeInstanceOf(MdString);
      expect(result.toString()).toBe(markdownText);
    });

    it('preserves all markdown syntax', () => {
      const complexMarkdown = '**Bold** _italic_ `code` [link](url) ![image](url) # Heading';
      const result = buildErrorMessage(complexMarkdown);

      expect(result).toBeInstanceOf(MdString);
      expect(result.toString()).toBe(complexMarkdown);
    });
  });

  describe('when useMarkdownInValidators is false', () => {
    beforeEach(async () => {
      const { getConfig } = await import('../config');
      vi.mocked(getConfig).mockReturnValue({ useMarkdownInValidators: false });
    });

    it('returns plain string with markdown removed', () => {
      const markdownText = '**Bold** text';
      const result = buildErrorMessage(markdownText);

      expect(typeof result).toBe('string');
      expect(result).toBe('Bold text');
    });

    it('removes basic markdown formatting', () => {
      const input = '**Bold** *italic* _underline_ ~strikethrough~ `code`';
      const expected = 'Bold italic underline strikethrough code';
      const result = buildErrorMessage(input);

      expect(result).toBe(expected);
    });

    it('removes links but keeps URL', () => {
      const input = 'Check [this link](https://example.com) for details';
      const expected = 'Check this link for details';
      const result = buildErrorMessage(input);

      expect(result).toBe(expected);
    });

    it('removes images completely', () => {
      const input = 'Image: ![alt text](https://example.com/image.png)';
      const expected = 'Image: alt text';
      const result = buildErrorMessage(input);

      expect(result).toBe(expected);
    });

    it('removes heading markers', () => {
      const input = '# Heading 1\n## Heading 2\n### Heading 3';
      const expected = 'Heading 1\nHeading 2\nHeading 3';
      const result = buildErrorMessage(input);

      expect(result).toBe(expected);
    });

    it('removes quote markers', () => {
      const input = '> This is a quote\n> Another line';
      const expected = 'This is a quote\nAnother line';
      const result = buildErrorMessage(input);

      expect(result).toBe(expected);
    });

    it('removes list markers', () => {
      const input = '- Item 1\n- Item 2\n1. Numbered item';
      const expected = 'Item 1\nItem 2\nNumbered item';
      const result = buildErrorMessage(input);

      expect(result).toBe(expected);
    });

    it('removes code blocks', () => {
      const input = 'Text before\n```\ncode block\n```\nText after';
      const expected = 'Text before\ncode block\nText after';
      const result = buildErrorMessage(input);

      expect(result).toBe(expected);
    });

    it('removes inline code markers', () => {
      const input = 'Use `console.log()` for debugging';
      const expected = 'Use console.log() for debugging';
      const result = buildErrorMessage(input);

      expect(result).toBe(expected);
    });

    it('removes excessive empty lines', () => {
      const input = 'Line 1\n\n\n\nLine 2';
      const expected = 'Line 1\nLine 2';
      const result = buildErrorMessage(input);

      expect(result).toBe(expected);
    });

    it('handles complex markdown combination', () => {
      const input = `# Error Details
      
**Important**: This field *must* contain a value.

> Check the [documentation](https://docs.example.com) for more info.

\`\`\`javascript
console.log('example');
\`\`\`

- Requirement 1
- Requirement 2`;

      const result = buildErrorMessage(input);

      // Should remove all markdown syntax
      expect(result).not.toContain('**');
      expect(result).not.toContain('*');
      expect(result).not.toContain('#');
      expect(result).not.toContain('>');
      expect(result).not.toContain('```');
      expect(result).not.toContain('[');
      expect(result).not.toContain(']');
      expect(result).not.toContain('-');

      // Should contain the actual text content
      expect(result).toContain('Error Details');
      expect(result).toContain('Important');
      expect(result).toContain('must contain a value');
      expect(result).toContain('documentation');
      expect(result).toContain('Requirement 1');
      expect(result).toContain('Requirement 2');
    });

    it('handles empty string', () => {
      const result = buildErrorMessage('');
      expect(result).toBe('');
    });

    it('handles string without markdown', () => {
      const plainText = 'This is plain text without any formatting';
      const result = buildErrorMessage(plainText);
      expect(result).toBe(plainText);
    });
  });
});
