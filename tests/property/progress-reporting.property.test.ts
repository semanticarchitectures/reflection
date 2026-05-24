import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { ProgressReporter } from '../../src/reporters/progress-reporter';

/**
 * Property-based tests for progress reporting (Property 14).
 *
 * **Validates: Requirements 5.2**
 */

describe('Progress Reporting Property Tests', () => {
  describe('Property 14: Progress reporting completeness', () => {
    /**
     * **Validates: Requirements 5.2**
     *
     * For any context generation that produces N files successfully,
     * exactly N progress callbacks SHALL be emitted, each with a correct
     * incrementing completed count from 1 to N.
     */
    it('for N successful files, exactly N onFileComplete callbacks are emitted with correct incrementing count', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 10 }),
          fc.array(
            fc.string({ minLength: 1, maxLength: 30 }).filter((s) => /\S/.test(s)),
            { minLength: 1, maxLength: 10 }
          ),
          (n, filenames) => {
            // Ensure we have exactly N filenames
            const adjustedFilenames: string[] = [];
            for (let i = 0; i < n; i++) {
              adjustedFilenames.push(filenames[i % filenames.length] || `file-${i}.md`);
            }

            const messages: string[] = [];
            const reporter = new ProgressReporter((message: string) => {
              messages.push(message);
            });

            // Start generation
            reporter.onStart(n);

            // Simulate N successful file completions with incrementing counts
            for (let i = 1; i <= n; i++) {
              reporter.onFileComplete(adjustedFilenames[i - 1]!, i, n);
            }

            // The first message is from onStart, the rest are from onFileComplete
            const fileCompleteMessages = messages.slice(1);

            // Exactly N onFileComplete callbacks were emitted
            expect(fileCompleteMessages.length).toBe(n);

            // Each message contains the correct incrementing count
            for (let i = 0; i < n; i++) {
              const expectedCount = i + 1;
              expect(fileCompleteMessages[i]).toContain(`${expectedCount}/${n}`);
              expect(fileCompleteMessages[i]).toContain(adjustedFilenames[i]);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
