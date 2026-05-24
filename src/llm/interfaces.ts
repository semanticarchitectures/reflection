/**
 * LLM Provider interfaces for the Context Generation system.
 *
 * Defines the uniform abstraction layer for communicating with
 * Large Language Model backends. All providers implement the
 * LLMProvider interface, enabling backend-agnostic usage across
 * pipeline stages.
 */

/**
 * A single message in a completion conversation.
 *
 * Messages are ordered and sent to the LLM provider as a conversation
 * history. The provider maps roles to its native format (e.g., Anthropic
 * extracts "system" messages into a top-level parameter).
 */
export interface CompletionMessage {
  /** The role of the message author. */
  role: 'system' | 'user' | 'assistant';
  /** The text content of the message. */
  content: string;
}

/**
 * A structured request sent to an LLM provider's completion endpoint.
 *
 * Contains the conversation messages, model selection, and optional
 * generation parameters for controlling output behavior.
 */
export interface CompletionRequest {
  /** Ordered array of messages forming the conversation. Must contain at least one message. */
  messages: CompletionMessage[];
  /** The model identifier to use for generation (e.g., "claude-sonnet-4-20250514"). */
  model: string;
  /** Maximum number of tokens to generate. Valid range: 1–128000. Defaults to 4096. */
  maxTokens?: number;
  /** Sampling temperature controlling randomness. Valid range: 0.0–2.0. */
  temperature?: number;
  /** Sequences that will cause the model to stop generating further tokens. */
  stopSequences?: string[];
}

/**
 * Token usage statistics for a completion call.
 *
 * All values are non-negative integers. The invariant
 * `totalTokens === promptTokens + completionTokens` always holds.
 */
export interface TokenUsage {
  /** Number of tokens in the input prompt. */
  promptTokens: number;
  /** Number of tokens in the generated response. */
  completionTokens: number;
  /** Total tokens consumed (promptTokens + completionTokens). */
  totalTokens: number;
}

/**
 * The structured response returned by an LLM provider after a completion call.
 */
export interface CompletionResponse {
  /** The generated text content from the model. */
  content: string;
  /** Token usage statistics for the completion call. */
  usage: TokenUsage;
}

/**
 * Uniform interface for LLM provider implementations.
 *
 * Each provider (e.g., Anthropic, OpenAI) implements this interface,
 * allowing pipeline stages to interact with any backend through a
 * consistent API. The provider handles authentication, request mapping,
 * and response extraction internally.
 */
export interface LLMProvider {
  /** Provider identifier. Lowercase alphanumeric characters and hyphens only, non-empty. */
  readonly name: string;

  /**
   * Send a completion request to the LLM and return the generated response.
   *
   * @param request - The completion request containing messages and generation parameters.
   * @returns A promise resolving to the completion response with generated content and token usage.
   * @throws Error if the request is invalid (empty messages, invalid maxTokens range),
   *         the provider is unreachable, authentication fails, or the request times out.
   */
  complete(request: CompletionRequest): Promise<CompletionResponse>;
}
