# Implementation Plan: LLM Provider Integration

## Overview

This plan implements an LLM provider abstraction layer for the Context Generation system. The implementation proceeds bottom-up: core interfaces and utilities first, then the Anthropic provider, registry, and retry logic, followed by integration into each pipeline stage. Each stage preserves existing heuristic behavior as fallback.

## Tasks

- [x] 1. Set up LLM module structure and core interfaces
  - [x] 1.1 Create `src/llm/interfaces.ts` with all LLM type definitions
    - Define `CompletionMessage`, `CompletionRequest`, `CompletionResponse`, `TokenUsage`, and `LLMProvider` interface
    - Include JSDoc comments for all types
    - Export all types for use by other modules
    - _Requirements: 1.1, 1.2, 1.5_

  - [x] 1.2 Add `generationMethod` field to `GeneratedFile` interface in `src/models/interfaces.ts`
    - Add optional `generationMethod?: 'llm' | 'heuristic'` field to the existing `GeneratedFile` interface
    - _Requirements: 9.4_

  - [x] 1.3 Install `@anthropic-ai/sdk` dependency
    - Add `@anthropic-ai/sdk` to package.json dependencies
    - Run npm install
    - _Requirements: 2.1_

- [x] 2. Implement JSON parser utility
  - [x] 2.1 Create `src/llm/json-parser.ts` with JSON extraction and validation logic
    - Implement `extractJSON()` function that strips markdown fences, leading/trailing text, and finds the first complete JSON object or array
    - Implement `parseAndValidate<T>()` function with type guard validation
    - Return `ParseResult<T>` with success/failure, data, error message, and truncated raw content (max 4000 chars)
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [ ]* 2.2 Write property test for JSON extraction from wrapped responses
    - **Property 14: JSON extraction from wrapped responses**
    - **Validates: Requirements 10.1**

  - [ ]* 2.3 Write property test for schema validation failure
    - **Property 15: Schema validation failure uses default structure**
    - **Validates: Requirements 10.3**

  - [ ]* 2.4 Write property test for log truncation
    - **Property 16: Log truncation**
    - **Validates: Requirements 10.4**

  - [ ]* 2.5 Write unit tests for JSON parser
    - Test markdown fence formats (```json, ```, no fences)
    - Test leading/trailing text extraction
    - Test invalid JSON handling
    - Test truncation of raw content at 4000 chars
    - _Requirements: 10.1, 10.3, 10.4_

- [x] 3. Implement retry handler
  - [x] 3.1 Create `src/llm/retry-handler.ts` with exponential backoff logic
    - Implement `RetryHandler` class with configurable `maxAttempts`, `baseDelayMs`, and `timeoutMs`
    - Implement `execute<T>()` method that retries on retryable errors (network timeout, HTTP 429, 500, 503)
    - Return error immediately for non-retryable errors (HTTP 400, 401, 403)
    - Use backoff schedule: 1s → 2s → 4s (base × 2^attempt)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 3.2 Write property test for retry behavior with retryable errors
    - **Property 11: Retry behavior for retryable errors**
    - **Validates: Requirements 8.1, 8.3, 8.5**

  - [ ]* 3.3 Write property test for non-retryable error bypass
    - **Property 12: Non-retryable errors bypass retry**
    - **Validates: Requirements 8.4**

  - [ ]* 3.4 Write unit tests for retry handler
    - Test timing verification (1s, 2s, 4s delays)
    - Test exactly 3 failures returning final error
    - Test immediate success on first attempt
    - Test non-retryable error codes (400, 401, 403)
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement Anthropic provider
  - [x] 5.1 Create `src/llm/anthropic-provider.ts` implementing `LLMProvider` interface
    - Read `ANTHROPIC_API_KEY` from environment, reject empty/whitespace-only values
    - Initialize `@anthropic-ai/sdk` client with 30s timeout
    - Map `CompletionMessage[]` to Anthropic format: system messages to top-level `system` param, user/assistant to `messages` array preserving order
    - Validate `maxTokens` range [1, 128000], reject invalid values
    - Validate non-empty messages array
    - Extract response content and token usage into `CompletionResponse`
    - Wrap provider errors into generic error messages without exposing internals
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 1.3, 1.4, 1.6, 1.7, 4.1, 4.5_

  - [ ]* 5.2 Write property test for token usage invariant
    - **Property 1: Token usage invariant**
    - **Validates: Requirements 1.2, 4.3**

  - [ ]* 5.3 Write property test for message format mapping
    - **Property 2: Message format mapping preserves semantics**
    - **Validates: Requirements 2.4**

  - [ ]* 5.4 Write property test for whitespace API key rejection
    - **Property 3: Whitespace API key rejection**
    - **Validates: Requirements 2.3**

  - [ ]* 5.5 Write property test for maxTokens range validation
    - **Property 5: MaxTokens range validation**
    - **Validates: Requirements 4.1, 4.5**

  - [ ]* 5.6 Write property test for error wrapping
    - **Property 17: Error wrapping hides provider internals**
    - **Validates: Requirements 1.6**

  - [ ]* 5.7 Write unit tests for Anthropic provider
    - Test construction with valid/invalid/whitespace API keys
    - Test message mapping with specific role combinations
    - Test forwarding of optional parameters (temperature, stop sequences)
    - Test authentication error handling (HTTP 401)
    - _Requirements: 2.2, 2.3, 2.4, 2.6, 2.8_

- [x] 6. Implement provider registry
  - [x] 6.1 Create `src/llm/provider-registry.ts` with environment-based configuration
    - Implement `register()` method to add providers by name
    - Implement `getActiveProvider()` resolving from `LLM_PROVIDER` env var, returning null if unset/empty/whitespace
    - Implement `getStageConfig()` resolving model and maxTokens from stage-specific env vars, then defaults
    - Model resolution: stage-specific → `LLM_MODEL_DEFAULT` → "claude-sonnet-4-20250514"
    - MaxTokens resolution: stage-specific → 4096 (ignore invalid values)
    - Return error listing available providers if `LLM_PROVIDER` doesn't match any registered provider
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.2, 4.4, 4.6_

  - [ ]* 6.2 Write property test for provider registry resolution
    - **Property 4: Provider registry resolution**
    - **Validates: Requirements 3.1, 3.6**

  - [ ]* 6.3 Write unit tests for provider registry
    - Test with various env var combinations (stage-specific, default, hardcoded)
    - Test unset/empty/whitespace LLM_PROVIDER returns null
    - Test invalid maxTokens env var values are ignored
    - Test error message lists available providers
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.4, 4.6_

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Integrate LLM into ContentPlanner
  - [x] 8.1 Update `src/planners/content-planner.ts` to use LLM provider with heuristic fallback
    - Accept `ProviderRegistry` as optional parameter
    - Build structured prompt from `TopicScope` requesting a content plan
    - Parse LLM response as JSON using `parseAndValidate` with ContentPlan validator
    - Validate plan has 2–10 PlannedFile entries with valid subtopics, descriptions, filenames (kebab-case, .md, ≤60 chars), and relatedFiles
    - Fall back to existing heuristic on any failure (parse error, validation error, timeout, provider error)
    - Log warning on fallback with stage name and error reason
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 9.2_

  - [ ]* 8.2 Write property test for ContentPlan JSON round-trip
    - **Property 6: ContentPlan JSON round-trip**
    - **Validates: Requirements 5.2**

  - [ ]* 8.3 Write property test for ContentPlan validation triggers fallback
    - **Property 7: ContentPlan validation triggers fallback**
    - **Validates: Requirements 5.5, 5.6**

  - [ ]* 8.4 Write property test for invalid JSON triggers ContentPlanner fallback
    - **Property 18: Invalid JSON triggers ContentPlanner fallback**
    - **Validates: Requirements 5.3**

  - [ ]* 8.5 Write unit tests for ContentPlanner LLM integration
    - Test with mocked provider returning valid plan
    - Test fallback when provider returns error
    - Test prompt contains TopicScope data
    - _Requirements: 5.1, 5.3, 5.4_

- [x] 9. Integrate LLM into FileGenerator
  - [x] 9.1 Update `src/generators/file-generator.ts` to use LLM provider with heuristic fallback
    - Accept `ProviderRegistry` as optional parameter
    - Build prompt from PlannedFile metadata, TopicScope, and summaries of previously generated files
    - Use LLM response as body content if ≥ 200 characters, otherwise fall back to heuristic
    - Set `generationMethod` field to `'llm'` or `'heuristic'` on the GeneratedFile
    - Fall back to heuristic on provider error or timeout, report through ProgressReporter
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 9.4_

  - [ ]* 9.2 Write property test for file content length threshold
    - **Property 8: File content length threshold**
    - **Validates: Requirements 6.2, 6.3**

  - [ ]* 9.3 Write property test for output interface conformance
    - **Property 13: Output interface conformance**
    - **Validates: Requirements 9.3, 9.4**

  - [ ]* 9.4 Write unit tests for FileGenerator LLM integration
    - Test with mocked provider returning ≥200 char content
    - Test fallback with <200 char response
    - Test generationMethod field correctly set
    - Test prompt includes previously generated file summaries
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 9.4_

- [x] 10. Integrate LLM into ClarificationAgent
  - [x] 10.1 Update `src/agents/clarification-agent.ts` to use LLM provider with heuristic fallback
    - Accept `ProviderRegistry` as optional parameter
    - Build prompt from topic description and use case description requesting clarification questions
    - Parse LLM response as JSON array of ClarificationQuestion objects (each with non-empty id, text, purpose)
    - Validate parsed questions contain 1–5 entries, fall back to heuristic if outside range
    - Fall back to heuristic on parse error, validation error, or provider failure
    - Log error on fallback, no logging when no provider configured
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 9.1_

  - [ ]* 10.2 Write property test for ClarificationQuestion JSON round-trip
    - **Property 9: ClarificationQuestion JSON round-trip**
    - **Validates: Requirements 7.3**

  - [ ]* 10.3 Write property test for ClarificationQuestion count validation
    - **Property 10: ClarificationQuestion count validation**
    - **Validates: Requirements 7.6**

  - [ ]* 10.4 Write property test for invalid JSON triggers ClarificationAgent fallback
    - **Property 19: Invalid JSON triggers ClarificationAgent fallback**
    - **Validates: Requirements 7.4**

  - [ ]* 10.5 Write unit tests for ClarificationAgent LLM integration
    - Test with mocked provider returning valid questions
    - Test fallback on invalid JSON
    - Test fallback on question count outside 1–5 range
    - Test no logging when no provider configured
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.6, 9.1_

- [x] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Wire LLM layer into pipeline orchestrator
  - [x] 12.1 Update `src/pipeline.ts` to initialize ProviderRegistry and pass to all stages
    - Create ProviderRegistry instance at pipeline start
    - Register AnthropicProvider if `LLM_PROVIDER` is set to "anthropic"
    - Pass registry to ContentPlanner, FileGenerator, and ClarificationAgent
    - Handle provider construction errors gracefully (fall back to no-provider mode)
    - _Requirements: 3.1, 3.2, 9.1, 9.2_

  - [ ]* 12.2 Write integration tests for full pipeline with LLM
    - Test full pipeline with mocked Anthropic API returning valid responses
    - Test full pipeline with no LLM_PROVIDER set (pure heuristic path)
    - Test full pipeline with LLM failures triggering fallback mid-generation
    - Verify output file structure is identical regardless of generation method
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 13. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The project uses TypeScript with Vitest for testing and fast-check for property-based tests
- All existing heuristic implementations remain intact as fallback paths
- The `@anthropic-ai/sdk` package is the only new runtime dependency

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "3.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "3.2", "3.3", "3.4"] },
    { "id": 3, "tasks": ["5.1", "6.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "6.2", "6.3"] },
    { "id": 5, "tasks": ["8.1", "9.1", "10.1"] },
    { "id": 6, "tasks": ["8.2", "8.3", "8.4", "8.5", "9.2", "9.3", "9.4", "10.2", "10.3", "10.4", "10.5"] },
    { "id": 7, "tasks": ["12.1"] },
    { "id": 8, "tasks": ["12.2"] }
  ]
}
```
