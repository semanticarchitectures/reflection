import { describe, it, expect } from 'vitest';
import { generateFilename } from '../../src/generators/filename-generator.js';
import { MAX_FILENAME_LENGTH } from '../../src/models/types.js';

describe('generateFilename', () => {
  describe('basic conversion', () => {
    it('converts a simple title to kebab-case', () => {
      expect(generateFilename('Hello World')).toBe('hello-world.md');
    });

    it('converts uppercase to lowercase', () => {
      expect(generateFilename('UPPERCASE TITLE')).toBe('uppercase-title.md');
    });

    it('handles mixed case', () => {
      expect(generateFilename('Getting Started Guide')).toBe('getting-started-guide.md');
    });

    it('preserves numbers', () => {
      expect(generateFilename('Chapter 3 Overview')).toBe('chapter-3-overview.md');
    });
  });

  describe('special character handling', () => {
    it('replaces special characters with hyphens', () => {
      expect(generateFilename('foo@bar#baz')).toBe('foo-bar-baz.md');
    });

    it('removes consecutive hyphens from multiple special chars', () => {
      expect(generateFilename('foo---bar')).toBe('foo-bar.md');
    });

    it('handles underscores', () => {
      expect(generateFilename('snake_case_title')).toBe('snake-case-title.md');
    });

    it('handles dots and slashes', () => {
      expect(generateFilename('path/to.something')).toBe('path-to-something.md');
    });

    it('handles parentheses and brackets', () => {
      expect(generateFilename('Title (with brackets) [and more]')).toBe('title-with-brackets-and-more.md');
    });
  });

  describe('unicode handling', () => {
    it('normalizes accented characters', () => {
      expect(generateFilename('café résumé')).toBe('cafe-resume.md');
    });

    it('strips non-latin unicode characters', () => {
      expect(generateFilename('日本語テスト')).toBe('untitled.md');
    });

    it('handles mixed unicode and ascii', () => {
      expect(generateFilename('hello 世界 world')).toBe('hello-world.md');
    });

    it('handles emoji', () => {
      expect(generateFilename('🚀 Launch Guide')).toBe('launch-guide.md');
    });
  });

  describe('edge cases', () => {
    it('returns untitled.md for empty string', () => {
      expect(generateFilename('')).toBe('untitled.md');
    });

    it('returns untitled.md for whitespace-only string', () => {
      expect(generateFilename('   ')).toBe('untitled.md');
    });

    it('returns untitled.md for all-special-character string', () => {
      expect(generateFilename('!@#$%^&*()')).toBe('untitled.md');
    });

    it('removes leading hyphens', () => {
      expect(generateFilename('---leading')).toBe('leading.md');
    });

    it('removes trailing hyphens', () => {
      expect(generateFilename('trailing---')).toBe('trailing.md');
    });

    it('handles single character title', () => {
      expect(generateFilename('a')).toBe('a.md');
    });

    it('handles single number title', () => {
      expect(generateFilename('7')).toBe('7.md');
    });
  });

  describe('length enforcement', () => {
    it('output never exceeds MAX_FILENAME_LENGTH', () => {
      const longTitle = 'a'.repeat(200);
      const result = generateFilename(longTitle);
      expect(result.length).toBeLessThanOrEqual(MAX_FILENAME_LENGTH);
    });

    it('truncates long titles to fit within 60 chars including .md', () => {
      // 57 chars of base + 3 chars for .md = 60
      const title = 'a'.repeat(100);
      const result = generateFilename(title);
      expect(result.length).toBe(MAX_FILENAME_LENGTH);
      expect(result).toBe('a'.repeat(57) + '.md');
    });

    it('does not leave trailing hyphens after truncation', () => {
      // Create a title that will have a hyphen right at the truncation point
      const title = 'a'.repeat(55) + ' b'.repeat(50);
      const result = generateFilename(title);
      expect(result.length).toBeLessThanOrEqual(MAX_FILENAME_LENGTH);
      expect(result).not.toMatch(/-\.md$/);
    });

    it('handles title that is exactly at max base length', () => {
      const title = 'a'.repeat(57); // exactly 57 + .md = 60
      const result = generateFilename(title);
      expect(result).toBe('a'.repeat(57) + '.md');
      expect(result.length).toBe(60);
    });

    it('handles title one char over max base length', () => {
      const title = 'a'.repeat(58); // 58 would be 61 with .md, so truncate
      const result = generateFilename(title);
      expect(result).toBe('a'.repeat(57) + '.md');
      expect(result.length).toBe(60);
    });
  });

  describe('filename pattern validity', () => {
    it('output matches the required pattern', () => {
      const pattern = /^[a-z0-9]+(-[a-z0-9]+)*\.md$/;
      const titles = [
        'Hello World',
        'Getting Started',
        'API Reference v2',
        'café résumé',
        'Chapter 3',
      ];
      for (const title of titles) {
        const result = generateFilename(title);
        expect(result).toMatch(pattern);
      }
    });
  });
});
