/**
 * Anthropic Claude implementation of the LLMProvider interface.
 *
 * Communicates with the Anthropic Messages API using @anthropic-ai/sdk.
 * Maps the uniform CompletionRequest format to Anthropic's native format,
 * extracting system messages to the top-level `system` parameter and
 * preserving user/assistant message ordering.
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  LLMProvider,
  CompletionRequest,
  CompletionResponse,
  CompletionMessage,
} from './interfaces.js';
import { RetryHandler } from './retry-handler.js';

/**
 * Maps CompletionMessages to Anthropic's expected format.
 * System messages are concatenated into a single top-level string.
 * User/assistant messages are preserved in order.
 */
function mapMessages(messages: CompletionMessage[]): {
  system: string | undefined;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
} {
  const systemParts: string[] = [];
  const mapped: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemParts.push(msg.content);
    } else {
      mapped.push({ role: msg.role, content: msg.content });
    }
  }

  return {
    system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
    messages: mapped,
  };
}

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;
  private readonly retryHandler: RetryHandler;

  constructor(retryHandler?: RetryHandler) {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not configured');
    }
    this.client = new Anthropic({ apiKey, timeout: 30_000 });
    this.retryHandler = retryHandler ?? new RetryHandler();
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    // Validate non-empty messages
    if (!request.messages || request.messages.length === 0) {
      throw new Error('At least one message is required');
    }

    // Validate model prefix
    if (!request.model.startsWith('claude-')) {
      throw new Error(`Unsupported model: ${request.model}. Only models prefixed with "claude-" are supported.`);
    }

    // Validate maxTokens range
    const maxTokens = request.maxTokens ?? 4096;
    if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 128000) {
      throw new Error('maxTokens must be an integer between 1 and 128000');
    }

    // Map messages to Anthropic format
    const { system, messages } = mapMessages(request.messages);

    try {
      const response = await this.retryHandler.execute(async () => {
        const params: Anthropic.MessageCreateParams = {
          model: request.model,
          max_tokens: maxTokens,
          messages,
        };

        if (system !== undefined) {
          params.system = system;
        }

        if (request.temperature !== undefined) {
          params.temperature = request.temperature;
        }

        if (request.stopSequences !== undefined && request.stopSequences.length > 0) {
          params.stop_sequences = request.stopSequences;
        }

        return this.client.messages.create(params);
      });

      // Extract text content from first text block
      const textBlock = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === 'text'
      );
      const content = textBlock?.text ?? '';

      // Extract token usage
      const promptTokens = response.usage.input_tokens;
      const completionTokens = response.usage.output_tokens;

      return {
        content,
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
      };
    } catch (error: unknown) {
      // Re-throw our own validation errors as-is
      if (error instanceof Error && (
        error.message === 'At least one message is required' ||
        error.message === 'maxTokens must be an integer between 1 and 128000' ||
        error.message.startsWith('Unsupported model:')
      )) {
        throw error;
      }

      // Wrap provider-specific errors into generic messages
      if (error instanceof Error && 'status' in error) {
        const status = (error as { status: number }).status;
        if (status === 401) {
          throw new Error('Authentication failed: API key is invalid or unauthorized');
        }
        if (status === 429) {
          throw new Error('Rate limit exceeded. Please retry later.');
        }
        if (status === 500 || status === 503) {
          throw new Error(`LLM service is temporarily unavailable (HTTP ${status})`);
        }
        if (status === 400) {
          // Include the error message for 400s — these are usually informative
          // (e.g., "messages: first message must use the user role")
          const detail = error.message || 'Bad request';
          throw new Error(`LLM request rejected: ${detail}`);
        }
        throw new Error(`LLM request failed (HTTP ${status}): ${error.message || 'Unknown error'}`);
      }

      // Generic wrapping — include the error message for debugging
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`LLM request failed: ${message}`);
    }
  }
}
