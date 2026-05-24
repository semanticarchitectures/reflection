import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { modifyFile, removeFile } from '../../src/refinement/refinement-handler';
import { GenerationSession, GeneratedFile, TopicScope, ContentPlan } from '../../src/models/interfaces';
import { MIN_FILES } from '../../src/models/types';

/**
 * Property-based tests for refinement constraints (Properties 15–16).
 *
 * Validates: Requirements 6.5, 6.6
 */

/**
 * Generator: produces a valid GeneratedFile with a given filename.
 */
function generatedFileArb(filename?: string): fc.Arbitrary<GeneratedFile> {
  const filenameArb = filename
    ? fc.constant(filename)
    : fc
        .stringMatching(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/)
        .filter((s) => s.length >= 3 && s.length <= 56)
        .map((s) => `${s}.md`);

  return fc.record({
    filename: filenameArb,
    title: fc.string({ minLength: 3, maxLength: 80 }).filter((s) => s.trim().length >= 3),
    content: fc
      .string({ minLength: 210, maxLength: 500 })
      .map((body) => `# Title\n\n${body}`),
    crossReferences: fc.constant([]),
  });
}

/**
 * Generator: produces a valid TopicScope.
 */
function topicScopeArb(): fc.Arbitrary<TopicScope> {
  return fc.record({
    originalTopic: fc.string({ minLength: 10, maxLength: 200 }).filter((s) => s.replace(/\s/g, '').length >= 10),
    originalUseCase: fc.string({ minLength: 10, maxLength: 200 }).filter((s) => s.replace(/\s/g, '').length >= 10),
    refinements: fc.array(fc.string({ minLength: 5, maxLength: 100 }), { minLength: 0, maxLength: 3 }),
    summary: fc.string({ minLength: 20, maxLength: 300 }).filter((s) => s.replace(/\s/g, '').length >= 10),
  });
}

/**
 * Generator: produces a GenerationSession with exactly the specified number of files.
 * Each file has a unique filename.
 */
function sessionWithFileCountArb(fileCount: number): fc.Arbitrary<GenerationSession> {
  return fc.tuple(topicScopeArb(), fc.array(generatedFileArb(), { minLength: fileCount, maxLength: fileCount })).map(
    ([scope, files]) => {
      // Ensure unique filenames by appending index
      const uniqueFiles = files.map((f, i) => ({
        ...f,
        filename: `file-${i}-${i}.md`,
      }));

      const plan: ContentPlan = {
        files: uniqueFiles.map((f) => ({
          subtopic: f.title,
          filename: f.filename,
          description: `Covers ${f.title}`,
          relatedFiles: [],
        })),
        estimatedTotal: uniqueFiles.length,
      };

      return {
        topicDescription: scope.originalTopic,
        useCaseDescription: scope.originalUseCase,
        scope,
        plan,
        generatedFiles: uniqueFiles,
        outputDir: '/tmp/test-output',
      };
    }
  );
}

/**
 * Generator: produces a GenerationSession with 2–10 files (variable count).
 */
function sessionWithVariableFilesArb(): fc.Arbitrary<GenerationSession> {
  return fc.integer({ min: 2, max: 10 }).chain((count) => sessionWithFileCountArb(count));
}

/**
 * Generator: produces a GenerationSession with 3–10 files.
 * Used for removeFile tests where we need more than MIN_FILES so the
 * minimum constraint check doesn't trigger before the "file not found" check.
 */
function sessionAboveMinFilesArb(): fc.Arbitrary<GenerationSession> {
  return fc.integer({ min: MIN_FILES + 1, max: 10 }).chain((count) => sessionWithFileCountArb(count));
}

/**
 * Generator: produces a filename that does NOT exist in a given set of filenames.
 */
function nonExistentFilenameArb(existingFilenames: string[]): fc.Arbitrary<string> {
  return fc
    .stringMatching(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/)
    .filter((s) => s.length >= 3 && s.length <= 50)
    .map((s) => `${s}.md`)
    .filter((name) => !existingFilenames.includes(name));
}

describe('Refinement Property Tests', () => {
  describe('Property 15: Minimum file count enforcement', () => {
    /**
     * **Validates: Requirements 6.5**
     *
     * For any Context_Set containing exactly 2 files, a removal request for any
     * file SHALL be rejected with an error indicating the minimum file count constraint.
     */
    it('removal is rejected when session has exactly MIN_FILES (2) files', () => {
      fc.assert(
        fc.property(sessionWithFileCountArb(MIN_FILES), (session) => {
          // Attempt to remove each file in the session
          for (const file of session.generatedFiles) {
            const result = removeFile(file.filename, session);

            // Removal must be rejected
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error!.toLowerCase()).toContain('minimum');
          }
        }),
        { numRuns: 100 }
      );
    });

    it('removal rejection preserves the original file set unchanged', () => {
      fc.assert(
        fc.property(sessionWithFileCountArb(MIN_FILES), (session) => {
          const originalFilenames = session.generatedFiles.map((f) => f.filename);

          // Attempt removal of the first file
          removeFile(session.generatedFiles[0]!.filename, session);

          // Session files remain unchanged
          const currentFilenames = session.generatedFiles.map((f) => f.filename);
          expect(currentFilenames).toEqual(originalFilenames);
          expect(session.generatedFiles.length).toBe(MIN_FILES);
        }),
        { numRuns: 100 }
      );
    });

    it('removal rejection error mentions the minimum count value', () => {
      fc.assert(
        fc.property(sessionWithFileCountArb(MIN_FILES), (session) => {
          const result = removeFile(session.generatedFiles[0]!.filename, session);

          expect(result.success).toBe(false);
          expect(result.error).toBeDefined();
          // Error should mention the minimum count
          expect(result.error!).toContain(String(MIN_FILES));
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 16: Invalid file reference error reporting', () => {
    /**
     * **Validates: Requirements 6.6**
     *
     * For any Context_Set and any filename that does not exist in the set, a
     * modification or removal request referencing that filename SHALL return an
     * error that lists all available Context_Files in the set.
     */
    it('removeFile with non-existent filename returns error listing available files', () => {
      fc.assert(
        fc.property(
          sessionAboveMinFilesArb().chain((session) => {
            const existingFilenames = session.generatedFiles.map((f) => f.filename);
            return fc.tuple(fc.constant(session), nonExistentFilenameArb(existingFilenames));
          }),
          ([session, nonExistentName]) => {
            const result = removeFile(nonExistentName, session);

            // Must fail
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();

            // Error must list all available files
            for (const file of session.generatedFiles) {
              expect(result.error!).toContain(file.filename);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('modifyFile with non-existent filename throws error listing available files', () => {
      fc.assert(
        fc.property(
          sessionWithVariableFilesArb().chain((session) => {
            const existingFilenames = session.generatedFiles.map((f) => f.filename);
            return fc.tuple(fc.constant(session), nonExistentFilenameArb(existingFilenames));
          }),
          ([session, nonExistentName]) => {
            // modifyFile throws an error for non-existent files
            expect(() => modifyFile(nonExistentName, 'some feedback', session)).toThrow();

            try {
              modifyFile(nonExistentName, 'some feedback', session);
            } catch (error: any) {
              // Error message must list all available files
              for (const file of session.generatedFiles) {
                expect(error.message).toContain(file.filename);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('error message mentions the non-existent filename that was requested', () => {
      fc.assert(
        fc.property(
          sessionAboveMinFilesArb().chain((session) => {
            const existingFilenames = session.generatedFiles.map((f) => f.filename);
            return fc.tuple(fc.constant(session), nonExistentFilenameArb(existingFilenames));
          }),
          ([session, nonExistentName]) => {
            const result = removeFile(nonExistentName, session);

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            // Error should mention the filename that was not found
            expect(result.error!).toContain(nonExistentName);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
