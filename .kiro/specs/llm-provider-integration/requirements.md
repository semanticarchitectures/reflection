# Requirements Document

## Introduction

The LLM Provider Integration adds an abstraction layer for Large Language Model backends to the Context Generation system. Currently, the ClarificationAgent, ContentPlanner, and FileGenerator use heuristic/template-based implementations. This feature introduces an LLMProvider interface that enables swapping between different LLM providers (starting with Anthropic Claude) to produce higher-quality content through the same existing interfaces (TopicScope, ContentPlan, PlannedFile, GeneratedFile). The existing heuristic implementations become the fallback when no provider is configured or when LLM calls fail.

## Glossary

- **LLM_Provider**: An abstraction that encapsulates communication with a specific Large Language Model API, exposing a uniform completion interface to the rest of the system.
- **Provider_Registry**: The component responsible for resolving which LLM_Provider implementation to use based on environment configuration.
- **Completion_Request**: A structured message payload sent to an LLM_Provider containing messages, model selection, and generation options.
- **Completion_Response**: The structured output returned by an LLM_Provider, containing the generated text and token usage metadata.
- **Token_Budget**: A configurable limit on the number of tokens consumed per completion call or per pipeline execution, used for cost control.
- **Fallback_Strategy**: The mechanism by which the system degrades gracefully to heuristic-based generation when an LLM call fails or no provider is configured.
- **Pipeline_Stage**: One of the three content generation components (ContentPlanner, FileGenerator, ClarificationAgent) that can be backed by an LLM_Provider.
- **Retry_Policy**: The configuration governing how failed LLM API calls are retried, including maximum attempts and backoff timing.
- **Stage_Model_Config**: Configuration that maps each Pipeline_Stage to a specific model identifier, allowing different models for different stages.

## Requirements

### Requirement 1: LLM Provider Interface

**User Story:** As a developer, I want a uniform interface for LLM providers, so that I can swap between different backends without changing the modules that consume them.

#### Acceptance Criteria

1. THE LLM_Provider SHALL expose a `complete` method that accepts a Completion_Request containing an array of messages (each with a role string and content string), a model identifier string, and optional generation parameters (max tokens as a positive integer, temperature as a floating-point number between 0.0 and 2.0 inclusive, and stop sequences as an array of strings).
2. THE LLM_Provider SHALL return a Completion_Response containing the generated text content as a string and a token usage summary with prompt tokens, completion tokens, and total tokens as non-negative integers where total tokens equals the sum of prompt tokens and completion tokens.
3. IF the LLM_Provider receives a Completion_Request with an empty messages array, THEN THE LLM_Provider SHALL return an error indicating that at least one message is required.
4. IF the LLM_Provider receives a Completion_Request with a model identifier that the provider does not support, THEN THE LLM_Provider SHALL return an error identifying the unsupported model.
5. THE LLM_Provider SHALL expose a `name` property that returns a non-empty lowercase string containing only alphanumeric characters and hyphens, identifying the provider implementation (e.g., "anthropic", "openai").
6. IF the underlying provider service is unreachable or returns a non-successful response, THEN THE LLM_Provider SHALL return an error indicating the nature of the failure without exposing provider-specific error structures to the caller.
7. IF the underlying provider service does not respond within 30 seconds, THEN THE LLM_Provider SHALL abort the request and return a timeout error.

### Requirement 2: Anthropic Claude Provider Implementation

**User Story:** As a developer, I want an Anthropic Claude implementation of the LLM Provider interface, so that the system can use Claude models for content generation.

#### Acceptance Criteria

1. THE LLM_Provider SHALL communicate with the Anthropic API using the `@anthropic-ai/sdk` package to send Completion_Requests and receive Completion_Responses.
2. THE LLM_Provider SHALL read the Anthropic API key from the `ANTHROPIC_API_KEY` environment variable at construction time.
3. IF the `ANTHROPIC_API_KEY` environment variable is not set, is empty, or contains only whitespace characters, THEN THE LLM_Provider SHALL return an error indicating that the API key is not configured.
4. THE LLM_Provider SHALL map the Completion_Request message format to the Anthropic messages API format, where messages with the "system" role are passed as the top-level `system` parameter and messages with "user" or "assistant" roles are passed in the `messages` array preserving their order, role, and content.
5. THE LLM_Provider SHALL accept any model identifier string prefixed with "claude-" and forward it to the Anthropic API, supporting at minimum "claude-sonnet-4-20250514" and "claude-haiku-4-20250514".
6. THE LLM_Provider SHALL forward optional generation parameters from the Completion_Request (temperature, stop sequences, maxTokens) to the corresponding Anthropic API parameters, omitting any parameter not specified in the request.
7. THE LLM_Provider SHALL extract the generated text content and token usage (prompt tokens, completion tokens, total tokens) from the Anthropic API response and return them in a Completion_Response.
8. IF the Anthropic API returns an authentication error (HTTP 401), THEN THE LLM_Provider SHALL return an error indicating that the API key is invalid or unauthorized.

### Requirement 3: Provider Registry and Configuration

**User Story:** As a developer, I want environment-based configuration for provider selection and model mapping, so that I can control which LLM backend and models are used without code changes.

#### Acceptance Criteria

1. THE Provider_Registry SHALL resolve the active LLM_Provider based on the `LLM_PROVIDER` environment variable (e.g., "anthropic"), matching the variable value to a registered provider implementation by name.
2. IF the `LLM_PROVIDER` environment variable is not set or contains an empty or whitespace-only value, THEN THE Provider_Registry SHALL indicate that no provider is configured by returning no active provider, and the system SHALL use heuristic fallback for all Pipeline_Stages.
3. WHEN a Pipeline_Stage requests its model identifier, THE Provider_Registry SHALL return the value of the corresponding stage-specific environment variable (`LLM_MODEL_PLANNER` for ContentPlanner, `LLM_MODEL_GENERATOR` for FileGenerator, `LLM_MODEL_CLARIFIER` for ClarificationAgent).
4. IF a stage-specific model environment variable is not set or contains an empty or whitespace-only value, THEN THE Provider_Registry SHALL use the value of the `LLM_MODEL_DEFAULT` environment variable as the model for that stage.
5. IF neither a stage-specific model nor `LLM_MODEL_DEFAULT` is set, THEN THE Provider_Registry SHALL use "claude-sonnet-4-20250514" as the default model identifier.
6. IF the `LLM_PROVIDER` environment variable is set to a value that does not match any registered provider implementation, THEN THE Provider_Registry SHALL return an error indicating the unrecognized provider name and listing the available provider names.

### Requirement 4: Token Budget Management

**User Story:** As a developer, I want to control the token budget for LLM calls, so that I can manage API costs predictably.

#### Acceptance Criteria

1. THE LLM_Provider SHALL accept a `maxTokens` parameter in the Completion_Request as an integer value between 1 and 128000 inclusive that limits the maximum number of tokens in the generated response.
2. IF `maxTokens` is not specified in the Completion_Request, THEN THE LLM_Provider SHALL use a default value of 4096 tokens.
3. THE LLM_Provider SHALL include the actual token usage in every Completion_Response as three integer fields: prompt tokens, completion tokens, and total tokens, where total tokens equals the sum of prompt tokens and completion tokens.
4. IF the `LLM_MAX_TOKENS_PLANNER`, `LLM_MAX_TOKENS_GENERATOR`, or `LLM_MAX_TOKENS_CLARIFIER` environment variable is set, THEN THE Provider_Registry SHALL use that value as the maxTokens for the corresponding Pipeline_Stage.
5. IF `maxTokens` in the Completion_Request is not an integer, is less than 1, or is greater than 128000, THEN THE LLM_Provider SHALL reject the request and return an error indicating the valid range.
6. IF an `LLM_MAX_TOKENS_PLANNER`, `LLM_MAX_TOKENS_GENERATOR`, or `LLM_MAX_TOKENS_CLARIFIER` environment variable is set to a value that is not a valid integer between 1 and 128000, THEN THE Provider_Registry SHALL ignore the invalid value and use the default of 4096 tokens for that Pipeline_Stage.

### Requirement 5: ContentPlanner LLM Integration

**User Story:** As a user, I want the content planner to use an LLM for determining context set structure, so that the planned subtopics and file organization are more relevant and coherent.

#### Acceptance Criteria

1. WHEN an LLM_Provider is configured, THE ContentPlanner SHALL send the TopicScope to the LLM_Provider as a structured prompt requesting a content plan.
2. WHEN the LLM_Provider returns a Completion_Response, THE ContentPlanner SHALL parse the response as a JSON object conforming to the ContentPlan interface (an array of PlannedFile objects where each entry has a non-empty subtopic, a filename matching the kebab-case format defined in Requirement 4, a non-empty description, and a relatedFiles array referencing only filenames present within the same plan).
3. IF the LLM_Provider Completion_Response cannot be parsed as valid JSON conforming to the ContentPlan interface, THEN THE ContentPlanner SHALL fall back to the heuristic planning implementation.
4. IF the LLM_Provider returns an error, is unreachable, or does not respond within 30 seconds, THEN THE ContentPlanner SHALL fall back to the heuristic planning implementation and log the error.
5. THE ContentPlanner SHALL validate that the LLM-generated plan contains between 2 and 10 PlannedFile entries, and IF the plan violates this constraint, THEN THE ContentPlanner SHALL fall back to the heuristic planning implementation.
6. IF any PlannedFile entry in the LLM-generated plan has an empty subtopic, an empty description, or a filename that does not conform to the kebab-case format with .md extension and maximum 60-character length, THEN THE ContentPlanner SHALL fall back to the heuristic planning implementation.

### Requirement 6: FileGenerator LLM Integration

**User Story:** As a user, I want the file generator to use an LLM for producing content, so that the generated markdown files are more informative and contextually rich.

#### Acceptance Criteria

1. WHEN an LLM_Provider is configured, THE FileGenerator SHALL send the PlannedFile metadata, TopicScope, and summaries of all previously generated files in the Context_Set to the LLM_Provider as a prompt requesting markdown content for the planned subtopic.
2. WHEN the LLM_Provider returns a Completion_Response containing 200 or more characters of content, THE FileGenerator SHALL use the Completion_Response as the body content of the GeneratedFile, preserving the existing filename, title, and cross-reference structure.
3. IF the LLM_Provider Completion_Response is empty or contains fewer than 200 characters of content, THEN THE FileGenerator SHALL fall back to the heuristic generation implementation for that file.
4. IF the LLM_Provider returns an error or fails to respond within 30 seconds, THEN THE FileGenerator SHALL fall back to the heuristic generation implementation for that file and report the error through the ProgressReporter.
5. IF no LLM_Provider is configured, THEN THE FileGenerator SHALL generate file content using the heuristic generation implementation without attempting an LLM request.

### Requirement 7: ClarificationAgent LLM Integration

**User Story:** As a user, I want the clarification agent to use an LLM for generating questions, so that the questions are more targeted and contextually relevant.

#### Acceptance Criteria

1. WHEN an LLM_Provider is configured, THE ClarificationAgent SHALL send the Topic_Description and Use_Case_Description to the LLM_Provider as a prompt requesting clarification questions.
2. IF no LLM_Provider is configured, THEN THE ClarificationAgent SHALL use the heuristic question generation implementation without reporting an error.
3. WHEN the LLM_Provider returns a Completion_Response, THE ClarificationAgent SHALL parse the response as a JSON array of ClarificationQuestion objects, where each object contains non-empty id, text, and purpose string fields.
4. IF the LLM_Provider Completion_Response cannot be parsed as valid JSON, or any entry in the array is missing a non-empty id, text, or purpose field, THEN THE ClarificationAgent SHALL fall back to the heuristic question generation implementation.
5. IF the LLM_Provider returns an error or does not respond within 30 seconds, THEN THE ClarificationAgent SHALL fall back to the heuristic question generation implementation and log the error.
6. IF the parsed LLM-generated questions contain fewer than 1 or more than 5 entries, THEN THE ClarificationAgent SHALL fall back to the heuristic question generation implementation.

### Requirement 8: Retry Logic with Exponential Backoff

**User Story:** As a developer, I want failed LLM API calls to be retried with exponential backoff, so that transient network or rate-limit errors do not immediately cause fallback to heuristics.

#### Acceptance Criteria

1. WHEN an LLM API call fails with a retryable error (network timeout exceeding 30 seconds, HTTP 429, HTTP 500, HTTP 503), THE LLM_Provider SHALL retry the request up to a maximum of 3 attempts, where each attempt uses the same 30-second timeout threshold.
2. THE LLM_Provider SHALL wait an exponentially increasing duration between retries, starting at 1 second and doubling with each subsequent attempt (1s, 2s, 4s).
3. IF all 3 retry attempts are exhausted, THEN THE LLM_Provider SHALL return the error from the final failed attempt to the calling Pipeline_Stage for fallback handling.
4. WHEN an LLM API call fails with a non-retryable error (HTTP 400, HTTP 401, HTTP 403), THE LLM_Provider SHALL return the error immediately without retrying.
5. WHEN a retry attempt succeeds, THE LLM_Provider SHALL return the successful response to the calling Pipeline_Stage as if the original call had succeeded.

### Requirement 9: Graceful Degradation to Heuristic Fallback

**User Story:** As a user, I want the system to continue working even when the LLM is unavailable, so that I always get context files regardless of API availability.

#### Acceptance Criteria

1. WHEN no LLM_Provider is configured (the `LLM_PROVIDER` environment variable is unset), THE Context_Generator SHALL use the existing heuristic implementations for all Pipeline_Stages without logging any warnings.
2. IF an LLM_Provider is configured but a specific Pipeline_Stage call fails after a maximum of 3 retry attempts (where failure is defined as a network error, a timeout exceeding 30 seconds per attempt, or a non-2xx response from the provider), THEN THE Pipeline_Stage SHALL execute the heuristic implementation and log a warning indicating the stage name and the reason for fallback.
3. THE Context_Generator SHALL produce output conforming to the same interfaces (ContentPlan, GeneratedFile, ClarificationQuestion) regardless of whether the LLM or heuristic path was used.
4. WHEN fallback occurs during content generation, THE Context_Generator SHALL set a `generationMethod` field on the GeneratedFile to the value `"heuristic"`, and set it to `"llm"` when the LLM path succeeds, so that callers can programmatically determine which path produced each file.

### Requirement 10: Structured JSON Output Parsing

**User Story:** As a developer, I want robust JSON parsing for LLM responses, so that malformed outputs are handled gracefully without crashing the system.

#### Acceptance Criteria

1. THE Context_Generator SHALL extract JSON content from LLM responses that may contain markdown code fences, leading/trailing text, or other non-JSON content surrounding the JSON payload, by identifying the first complete JSON object or array in the response.
2. IF the extracted content is not valid JSON after up to 2 extraction attempts (re-prompting the LLM on the first failure), THEN THE Context_Generator SHALL use a default empty structure conforming to the expected schema for the affected Pipeline_Stage and log the failure.
3. IF the parsed JSON does not conform to the expected schema for the Pipeline_Stage (missing required fields or fields with incorrect types as defined by the stage's interface), THEN THE Context_Generator SHALL use a default empty structure conforming to the expected schema for the affected Pipeline_Stage and log the failure.
4. WHEN a JSON parsing or schema validation failure occurs, THE Context_Generator SHALL log the raw LLM response content, truncated to a maximum of 4000 characters, along with the Pipeline_Stage name and the nature of the failure.
5. IF all retry attempts for JSON parsing are exhausted for a Pipeline_Stage, THEN THE Context_Generator SHALL propagate the failure to the pipeline error handling for that stage, preserving any previously successful outputs.
