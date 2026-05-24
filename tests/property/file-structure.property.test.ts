import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { planContextSet } from '../../src/planners/content-planner';
import { generateFilename } from '../../src/generators/filename-generator';
import { generateFile } from '../../src/generators/file-generator';
import { TopicScope } from '../../src/models/interfaces';
import { MIN_FILES, MAX_FILES, MAX_FILENAME_LENGTH } from '../../src/models/types';

/**
 * Property-based tests for file structure (Properties 8–11).
 *
 * Validates: Requirements 3.2, 3.3, 3.4, 3.5, 4.2
 */

/**
 * Generator: produces a valid TopicScope object with random but realistic data.
 */
function topicScopeArb(): fc.Arbitrary<TopicScope> {
  return fc.record({
    originalTopic: fc.string({ minLength: 10, maxLength: 200 }).filter((s) => s.replace(/\s/g, '').length >= 10),
    originalUseCase: fc.string({ minLength: 10, maxLength: 200 }).filter((s) => s.replace(/\s/g, '').length >= 10),
    refinements: fc.array(
      fc.string({ minLength: 5, maxLength: 100 }).filter((s) => s.trim().length >= 5),
      { minLength: 0, maxLength: 5 }
    ),
    summary: fc.string({ minLength: 20, maxLength: 500 }).filter((s) => s.replace(/\s/g, '').length >= 10),
  });
}

/**
 * Generator: produces random subtopic titles of varying length and character sets.
 */
function subtopicTitleArb(): fc.Arbitrary<string> {
  return fc.oneof(
    // Normal English-like titles
    fc.array(
      fc.constantFrom(
        'Introduction', 'Overview', 'Architecture', 'Design Patterns',
        'Error Handling', 'Testing Strategies', 'Performance', 'Security',
        'Data Models', 'API Design', 'Deployment', 'Monitoring',
        'Authentication', 'Authorization', 'Caching', 'Concurrency'
      ),
      { minLength: 1, maxLength: 3 }
    ).map((words) => words.join(' ')),
    // Titles with special characters
    fc.string({ minLength: 3, maxLength: 100 }),
    // Very long titles that will need truncation
    fc.string({ minLength: 60, maxLength: 200 }),
    // Titles with unicode characters
    fc.unicodeString({ minLength: 3, maxLength: 80 })
  );
}

describe('File Structure Property Tests', () => {
  describe('Property 8: Context file subtopic uniqueness', () => {
    /**
     * **Validates: Requirements 3.2**
     *
     * For any generated Context_Set, no two Context_Files shall have
     * the same subtopic title or filename.
     */
    it('no two planned files share the same subtopic title', async () => {
      await fc.assert(
        fc.asyncProperty(topicScopeArb(), async (scope) => {
          const plan = await planContextSet(scope);

          const subtopics = plan.files.map((f) => f.subtopic.toLowerCase().trim());
          const uniqueSubtopics = new Set(subtopics);
          expect(uniqueSubtopics.size).toBe(subtopics.length);
        }),
        { numRuns: 100 }
      );
    });

    it('no two planned files share the same filename', async () => {
      await fc.assert(
        fc.asyncProperty(topicScopeArb(), async (scope) => {
          const plan = await planContextSet(scope);

          const filenames = plan.files.map((f) => f.filename);
          const uniqueFilenames = new Set(filenames);
          expect(uniqueFilenames.size).toBe(filenames.length);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 9: Context file structural validity', () => {
    /**
     * **Validates: Requirements 3.3, 3.4**
     *
     * For any generated Context_File, the first line shall be an H1 markdown
     * heading (starting with "# "), and the content following the heading
     * shall be at least 200 characters in length.
     *
     * NOTE: FileGenerator is not yet implemented. This is a placeholder test
     * that will be updated once the FileGenerator module exists.
     */
    it('generated file content starts with H1 heading and body is ≥200 chars', async () => {
      await fc.assert(
        fc.asyncProperty(topicScopeArb(), async (scope) => {
          const plan = await planContextSet(scope);

          for (const planned of plan.files) {
            const generated = await generateFile(planned, scope, []);
            const lines = generated.content.split('\n');

            // First line must be an H1 heading
            expect(lines[0]).toMatch(/^# .+/);

            // Body content (everything after heading + blank line) must be ≥200 chars
            const bodyContent = lines.slice(2).join('\n');
            expect(bodyContent.length).toBeGreaterThanOrEqual(200);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 10: Context set size bounds', () => {
    /**
     * **Validates: Requirements 3.5**
     *
     * For any generated Context_Set, the number of Context_Files shall be
     * between 2 and 10 inclusive.
     */
    it('file count is between MIN_FILES and MAX_FILES inclusive', async () => {
      await fc.assert(
        fc.asyncProperty(topicScopeArb(), async (scope) => {
          const plan = await planContextSet(scope);

          expect(plan.files.length).toBeGreaterThanOrEqual(MIN_FILES);
          expect(plan.files.length).toBeLessThanOrEqual(MAX_FILES);
        }),
        { numRuns: 100 }
      );
    });

    it('estimatedTotal matches actual file count', async () => {
      await fc.assert(
        fc.asyncProperty(topicScopeArb(), async (scope) => {
          const plan = await planContextSet(scope);

          expect(plan.estimatedTotal).toBe(plan.files.length);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 11: Filename format validity', () => {
    /**
     * **Validates: Requirements 4.2**
     *
     * For any subtopic title, the generated filename shall be kebab-case
     * (matching pattern [a-z0-9]+(-[a-z0-9]+)*\.md), end with .md,
     * and be at most 60 characters in total length.
     */
    it('generated filename ends with .md', () => {
      fc.assert(
        fc.property(subtopicTitleArb(), (title) => {
          const filename = generateFilename(title);
          expect(filename.endsWith('.md')).toBe(true);
        }),
        { numRuns: 100 }
      );
    });

    it('generated filename is at most MAX_FILENAME_LENGTH characters', () => {
      fc.assert(
        fc.property(subtopicTitleArb(), (title) => {
          const filename = generateFilename(title);
          expect(filename.length).toBeLessThanOrEqual(MAX_FILENAME_LENGTH);
        }),
        { numRuns: 100 }
      );
    });

    it('generated filename matches kebab-case pattern', () => {
      fc.assert(
        fc.property(subtopicTitleArb(), (title) => {
          const filename = generateFilename(title);
          // Pattern: [a-z0-9]+(-[a-z0-9]+)*\.md
          const kebabPattern = /^[a-z0-9]+(-[a-z0-9]+)*\.md$/;
          expect(filename).toMatch(kebabPattern);
        }),
        { numRuns: 100 }
      );
    });

    it('filenames from planContextSet are valid kebab-case', async () => {
      await fc.assert(
        fc.asyncProperty(topicScopeArb(), async (scope) => {
          const plan = await planContextSet(scope);
          const kebabPattern = /^[a-z0-9]+(-[a-z0-9]+)*\.md$/;

          for (const file of plan.files) {
            expect(file.filename).toMatch(kebabPattern);
            expect(file.filename.length).toBeLessThanOrEqual(MAX_FILENAME_LENGTH);
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});
