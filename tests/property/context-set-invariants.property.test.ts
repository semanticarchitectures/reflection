import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { planContextSet } from '../../src/planners/content-planner';
import { generateFile } from '../../src/generators/file-generator';
import { buildIndex } from '../../src/writers/index-builder';
import { TopicScope, GeneratedFile } from '../../src/models/interfaces';

/**
 * Property-based tests for index and cross-references (Properties 12–13).
 *
 * Validates: Requirements 4.1, 4.4, 4.5, 6.2, 6.3, 6.4
 */

/**
 * Generator: produces a valid TopicScope object with random but realistic data.
 */
function topicScopeArb(): fc.Arbitrary<TopicScope> {
  return fc.record({
    originalTopic: fc
      .string({ minLength: 10, maxLength: 200 })
      .filter((s) => s.replace(/\s/g, '').length >= 10),
    originalUseCase: fc
      .string({ minLength: 10, maxLength: 200 })
      .filter((s) => s.replace(/\s/g, '').length >= 10),
    refinements: fc.array(
      fc.string({ minLength: 5, maxLength: 100 }).filter((s) => s.trim().length >= 5),
      { minLength: 0, maxLength: 5 }
    ),
    summary: fc
      .string({ minLength: 20, maxLength: 500 })
      .filter((s) => s.replace(/\s/g, '').length >= 10),
  });
}

/**
 * Helper: generates a full context set (plan → generate files) from a TopicScope.
 * Files are generated sequentially so cross-references can resolve against earlier files.
 */
async function generateContextSet(scope: TopicScope): Promise<GeneratedFile[]> {
  const plan = await planContextSet(scope);
  const generatedFiles: GeneratedFile[] = [];

  for (const planned of plan.files) {
    const file = await generateFile(planned, scope, generatedFiles);
    generatedFiles.push(file);
  }

  return generatedFiles;
}

describe('Context Set Invariants Property Tests', () => {
  describe('Property 12: Index completeness and accuracy', () => {
    /**
     * **Validates: Requirements 4.1, 6.2, 6.3**
     *
     * For any Context_Set at any point in time (after generation, after addition,
     * after removal), the index.md file shall contain exactly one entry for each
     * Context_File in the set, where each entry includes a relative markdown link
     * to the file and a one-to-two sentence description.
     */
    it('index contains exactly one entry per generated file', async () => {
      await fc.assert(
        fc.asyncProperty(topicScopeArb(), async (scope) => {
          const files = await generateContextSet(scope);
          const index = buildIndex(files);
          const indexLines = index.split('\n').filter((line) => line.startsWith('- ['));

          // Exactly one entry per file
          expect(indexLines.length).toBe(files.length);
        }),
        { numRuns: 100 }
      );
    });

    it('each index entry contains the correct relative link format [title](./{filename})', async () => {
      await fc.assert(
        fc.asyncProperty(topicScopeArb(), async (scope) => {
          const files = await generateContextSet(scope);
          const index = buildIndex(files);
          const indexLines = index.split('\n').filter((line) => line.startsWith('- ['));

          for (const file of files) {
            const expectedLink = `[${file.title}](./${file.filename})`;
            const matchingLine = indexLines.find((line) => line.includes(expectedLink));
            expect(matchingLine).toBeDefined();
          }
        }),
        { numRuns: 100 }
      );
    });

    it('each index entry includes a non-empty description after the em dash', async () => {
      await fc.assert(
        fc.asyncProperty(topicScopeArb(), async (scope) => {
          const files = await generateContextSet(scope);
          const index = buildIndex(files);
          const indexLines = index.split('\n').filter((line) => line.startsWith('- ['));

          for (const line of indexLines) {
            // Format: - [{title}](./{filename}) — {description}
            const dashIndex = line.indexOf('—');
            expect(dashIndex).toBeGreaterThan(-1);
            const description = line.slice(dashIndex + 1).trim();
            expect(description.length).toBeGreaterThan(0);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('no file appears more than once in the index', async () => {
      await fc.assert(
        fc.asyncProperty(topicScopeArb(), async (scope) => {
          const files = await generateContextSet(scope);
          const index = buildIndex(files);
          const indexLines = index.split('\n').filter((line) => line.startsWith('- ['));

          // Extract filenames from index links
          const linkedFilenames: string[] = [];
          const linkPattern = /\]\(\.\/([^)]+)\)/;
          for (const line of indexLines) {
            const match = line.match(linkPattern);
            if (match) {
              linkedFilenames.push(match[1]!);
            }
          }

          const uniqueLinked = new Set(linkedFilenames);
          expect(uniqueLinked.size).toBe(linkedFilenames.length);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 13: Cross-reference integrity', () => {
    /**
     * **Validates: Requirements 4.4, 4.5, 6.4**
     *
     * For any Context_Set at any point in time, every relative markdown link
     * within any Context_File shall point to a file that exists in the Context_Set.
     * No broken links shall exist.
     */
    it('every relative link in generated files points to an existing file in the set', async () => {
      await fc.assert(
        fc.asyncProperty(topicScopeArb(), async (scope) => {
          const files = await generateContextSet(scope);
          const filenames = new Set(files.map((f) => f.filename));

          // Extract all relative markdown links from all files
          const relativeLinkPattern = /\]\(\.\/([^)]+)\)/g;

          for (const file of files) {
            let match: RegExpExecArray | null;
            while ((match = relativeLinkPattern.exec(file.content)) !== null) {
              const targetFilename = match[1]!;
              expect(filenames.has(targetFilename)).toBe(true);
            }
            // Reset regex lastIndex for next file
            relativeLinkPattern.lastIndex = 0;
          }
        }),
        { numRuns: 100 }
      );
    });

    it('cross-references in GeneratedFile metadata only reference existing files', async () => {
      await fc.assert(
        fc.asyncProperty(topicScopeArb(), async (scope) => {
          const files = await generateContextSet(scope);
          const filenames = new Set(files.map((f) => f.filename));

          for (const file of files) {
            for (const ref of file.crossReferences) {
              expect(filenames.has(ref.targetFilename)).toBe(true);
            }
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});
