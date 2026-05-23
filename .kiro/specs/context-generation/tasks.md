# Implementation Plan: Context Generation

## Overview

Implement the Context Generation system as a TypeScript pipeline that accepts a topic and use case, refines the request through interactive clarification questions, and produces a structured set of markdown context files. The implementation follows the layered pipeline architecture defined in the design: InputValidator → ClarificationAgent → ContentPlanner → FileGenerator → IndexBuilder → OutputWriter → ProgressReporter, with a RefinementHandler for post-generation modifications.

## Tasks

- [ ] 1. Set up project structure and core interfaces
  - [ ] 1.1 Create directory structure and initialize TypeScript project
    - Create `src/` directory with subdirectories: `validators/`, `agents/`, `planners/`, `generators/`, `writers/`, `reporters/`, `refinement/`, `models/`
    - Create `tests/` directory with subdirectories: `unit/`, `property/`, `integration/`
    - Initialize `tsconfig.json` with strict mode enabled
    - Add `fast-check` and a test runner (e.g., vitest) as dev dependencies
    - _Requirements: 1.1, 1.2, 3.1_

  - [ ] 1.2 Define core interfaces and type definitions
    - Create `src/models/interfaces.ts` with all interfaces from the design: `ValidationResult`, `ClarificationQuestion`, `TopicScope`, `ContentPlan`, `PlannedFile`, `GeneratedFile`, `CrossReference`, `WriteResult`, `RemoveResult`, `GenerationSession`
    - Create `src/models/types.ts` with constants for limits (max topic length 2000, max use case length 1000, min content length 10, max files 10, min files 2, max filename length 60)
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 3.5_

- [ ] 2. Implement input validation
  - [ ] 2.1 Implement InputValidator module
    - Create `src/validators/input-validator.ts`
    - Implement `validateTopicDescription`: accept strings with 10–2000 non-whitespace chars, reject empty/whitespace-only/too-short/too-long inputs with specific error messages
    - Implement `validateUseCaseDescription`: accept strings with 10–1000 non-whitespace chars, reject with specific error messages
    - Return structured `ValidationResult` objects
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6_

  - [ ]* 2.2 Write property tests for input validation (Properties 1–3)
    - **Property 1: Valid input acceptance** — For any string with ≥10 non-whitespace chars and ≤ max length, validator accepts
    - **Property 2: Invalid input rejection — insufficient content** — For any string that is empty, whitespace-only, or <10 non-whitespace chars, validator rejects
    - **Property 3: Invalid input rejection — exceeds maximum length** — For any string exceeding max length, validator rejects with length error
    - **Validates: Requirements 1.1, 1.2, 1.4, 1.5, 1.6**

  - [ ]* 2.3 Write unit tests for InputValidator
    - Test boundary cases: exactly 10 non-whitespace chars, exactly at max length, one over max
    - Test whitespace-heavy strings (tabs, newlines, mixed)
    - Test error message content
    - _Requirements: 1.4, 1.5, 1.6_

- [ ] 3. Implement clarification agent
  - [ ] 3.1 Implement ClarificationAgent module
    - Create `src/agents/clarification-agent.ts`
    - Implement `generateQuestions`: analyze topic and use case, produce 1–5 questions targeting broad/underspecified areas
    - Implement `processAnswers`: combine original input with answers to produce a `TopicScope`
    - Implement `isComplete`: return true after 3 rounds or when all questions answered
    - Track session state: round count, questions asked, answers received
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ] 3.2 Implement clarification session state management
    - Create `src/agents/clarification-session.ts`
    - Track current round (1–3), questions asked, answers received
    - Enforce max 3 questions per batch, max 5 total questions
    - Handle empty/non-responsive answers by treating question as unanswered
    - Support skip-clarification flow (proceed with original input)
    - _Requirements: 2.2, 2.4, 2.5, 2.6_

  - [ ]* 3.3 Write property tests for clarification agent (Properties 4–7)
    - **Property 4: Clarification question count bounds** — For any valid input, generates 1–5 questions
    - **Property 5: Clarification question batch size** — Each batch contains ≤3 questions
    - **Property 6: Topic scope preserves original input** — Resulting scope contains original topic and use case unchanged
    - **Property 7: Clarification session terminates** — Session completes after ≤3 rounds or when all questions answered
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**

  - [ ]* 3.4 Write unit tests for clarification session
    - Test state transitions across rounds
    - Test empty answer handling
    - Test skip clarification flow
    - _Requirements: 2.4, 2.5, 2.6_

- [ ] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Implement content planning and file generation
  - [ ] 5.1 Implement ContentPlanner module
    - Create `src/planners/content-planner.ts`
    - Implement `planContextSet`: determine file count (2–10), subtopics, filenames, and cross-reference relationships
    - Generate kebab-case filenames from subtopic titles (max 60 chars, pattern `[a-z0-9]+(-[a-z0-9]+)*\.md`)
    - Ensure no duplicate subtopics or filenames in the plan
    - _Requirements: 3.1, 3.2, 3.5, 4.2_

  - [ ] 5.2 Implement filename generation utility
    - Create `src/generators/filename-generator.ts`
    - Convert subtopic titles to kebab-case
    - Enforce max 60 character limit including `.md` extension
    - Strip invalid characters, handle edge cases (unicode, special chars, very long titles)
    - _Requirements: 4.2_

  - [ ] 5.3 Implement FileGenerator module
    - Create `src/generators/file-generator.ts`
    - Implement `generateFile`: produce markdown content with H1 heading, minimum 200 chars of body content, and cross-references as relative links
    - Accept planned file metadata, topic scope, and existing files for cross-reference context
    - _Requirements: 3.3, 3.4, 4.4, 4.5_

  - [ ]* 5.4 Write property tests for file structure (Properties 8–11)
    - **Property 8: Context file subtopic uniqueness** — No two files share subtopic title or filename
    - **Property 9: Context file structural validity** — First line is H1 heading, body ≥200 chars
    - **Property 10: Context set size bounds** — File count between 2 and 10 inclusive
    - **Property 11: Filename format validity** — Kebab-case, ends with `.md`, ≤60 chars
    - **Validates: Requirements 3.2, 3.3, 3.4, 3.5, 4.2**

  - [ ]* 5.5 Write unit tests for filename generation
    - Test special characters, unicode, very long titles
    - Test boundary at exactly 60 characters
    - Test collision avoidance
    - _Requirements: 4.2_

- [ ] 6. Implement index building and output writing
  - [ ] 6.1 Implement IndexBuilder module
    - Create `src/writers/index-builder.ts`
    - Implement `buildIndex`: produce index.md content with relative markdown links and 1–2 sentence descriptions for each file
    - Format: `- [{Subtopic Title}](./{filename}) — {description}`
    - _Requirements: 4.1_

  - [ ] 6.2 Implement OutputWriter module
    - Create `src/writers/output-writer.ts`
    - Implement `writeContextSet`: write all generated files and index to a dedicated output directory
    - Implement `writeFile`: write a single file atomically
    - Implement `removeFile`: remove a file from the output directory
    - Handle errors gracefully (directory not writable, partial failures)
    - _Requirements: 4.3, 3.6_

  - [ ]* 6.3 Write property tests for index and cross-references (Properties 12–13)
    - **Property 12: Index completeness and accuracy** — Index contains exactly one entry per file with correct link and description
    - **Property 13: Cross-reference integrity** — Every relative link points to an existing file in the set
    - **Validates: Requirements 4.1, 4.4, 4.5, 6.2, 6.3, 6.4**

  - [ ]* 6.4 Write unit tests for IndexBuilder and OutputWriter
    - Test index with 0, 1, 2, and 10 files
    - Test file write success and failure scenarios
    - Test atomic write behavior
    - _Requirements: 4.1, 4.3_

- [ ] 7. Implement progress reporting
  - [ ] 7.1 Implement ProgressReporter module
    - Create `src/reporters/progress-reporter.ts`
    - Implement `onStart`: report generation started with estimated total
    - Implement `onFileComplete`: report file name and completed/total count
    - Implement `onFileError`: report file name and error
    - Implement `onComplete`: present summary of all generated files
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [ ]* 7.2 Write property test for progress reporting (Property 14)
    - **Property 14: Progress reporting completeness** — For N successful files, exactly N callbacks emitted with correct incrementing count
    - **Validates: Requirements 5.2**

- [ ] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Implement refinement handler
  - [ ] 9.1 Implement RefinementHandler module
    - Create `src/refinement/refinement-handler.ts`
    - Implement `modifyFile`: regenerate a file incorporating user feedback while preserving uncontradicted content
    - Implement `addFile`: generate a new file for a subtopic, update index
    - Implement `removeFile`: remove file, update index, update cross-references in other files
    - Enforce minimum 2 files constraint on removal
    - Handle invalid file references with helpful error listing available files
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [ ]* 9.2 Write property tests for refinement (Properties 15–16)
    - **Property 15: Minimum file count enforcement** — Removal rejected when set has exactly 2 files
    - **Property 16: Invalid file reference error reporting** — Non-existent filename returns error listing available files
    - **Validates: Requirements 6.5, 6.6**

  - [ ]* 9.3 Write unit tests for RefinementHandler
    - Test modify preserves uncontradicted content
    - Test add updates index correctly
    - Test remove updates cross-references
    - Test minimum file constraint
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 10. Implement pipeline orchestration and session management
  - [ ] 10.1 Implement GenerationSession and pipeline orchestrator
    - Create `src/session.ts` with `GenerationSession` class holding accumulated state
    - Create `src/pipeline.ts` orchestrating the full flow: validate → clarify → plan → generate → index → write
    - Wire all components together with proper error handling at each stage
    - Handle partial generation (preserve successful files, report failures)
    - _Requirements: 1.3, 3.6, 5.4_

  - [ ] 10.2 Implement error recovery and partial generation handling
    - If single file fails, log error, report to user, continue with remaining files
    - If all files fail, report complete failure
    - If output directory not writable, report before generation begins
    - Regenerate index after any error to reflect actual file state
    - _Requirements: 3.6, 5.4_

  - [ ]* 10.3 Write integration tests for full pipeline
    - Test full flow: input → clarification → generation → output
    - Test refinement cycle: generate → modify → verify consistency
    - Test error resilience: inject failures at each stage
    - Test file system interaction: verify files written correctly
    - _Requirements: 1.1, 1.2, 2.1, 3.1, 4.1, 5.1, 6.1_

- [ ] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The system uses `fast-check` for property-based testing as specified in the design
- All code is TypeScript with strict mode enabled

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "3.1", "3.2", "5.2"] },
    { "id": 3, "tasks": ["2.2", "2.3", "3.3", "3.4", "5.1"] },
    { "id": 4, "tasks": ["5.3", "5.4", "5.5"] },
    { "id": 5, "tasks": ["6.1", "6.2", "7.1"] },
    { "id": 6, "tasks": ["6.3", "6.4", "7.2"] },
    { "id": 7, "tasks": ["9.1"] },
    { "id": 8, "tasks": ["9.2", "9.3", "10.1"] },
    { "id": 9, "tasks": ["10.2"] },
    { "id": 10, "tasks": ["10.3"] }
  ]
}
```
