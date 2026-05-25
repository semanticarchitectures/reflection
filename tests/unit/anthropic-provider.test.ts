import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CompletionRequest } from '../../src/llm/interfaces.js';

// Mock the @anthropic-ai/sdk module
vi.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn(),
    },
  }));
  return { default: MockAnthropic };
});

describe('AnthropicProvider', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  async function createProvider(apiKey = 'sk-test-valid-key') {
    process.env.ANTHROPIC_API_KEY = apiKey;
    const { AnthropicProvider } = await import('../../src/llm/anthropic-provider.js');
    const { RetryHandler } = await import('../../src/llm/retry-handler.js');
    const noDelay = async (_ms: number) => {};
    const retryHandler = new RetryHandler({ maxAttempts: 1 }, noDelay);
    return new AnthropicProvider(retryHandler);
  }

  async function getClientMock(provider: unknown) {
    // Access the private client's messages.create mock
    const p = provider as { client: { messages: { create: ReturnType<typeof vi.fn> } } };
    return p.client.messages.create;
  }

  function makeSuccessResponse(content = 'Hello world', inputTokens = 10, outputTokens = 5) {
    return {
      content: [{ type: 'text', text: content }],
      usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    };
  }

  describe('construction', () => {
    it('constructs successfully with a valid API key', async () => {
      const provider = await createProvider('sk-valid-key-123');
      expect(provider.name).toBe('anthropic');
    });

    it('throws when ANTHROPIC_API_KEY is not set', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      const { AnthropicProvider } = await import('../../src/llm/anthropic-provider.js');
      expect(() => new AnthropicProvider()).toThrow(
        'ANTHROPIC_API_KEY environment variable is not configured'
      );
    });

    it('throws when ANTHROPIC_API_KEY is empty string', async () => {
      process.env.ANTHROPIC_API_KEY = '';
      const { AnthropicProvider } = await import('../../src/llm/anthropic-provider.js');
      expect(() => new AnthropicProvider()).toThrow(
        'ANTHROPIC_API_KEY environment variable is not configured'
      );
    });

    it('throws when ANTHROPIC_API_KEY is whitespace only', async () => {
      process.env.ANTHROPIC_API_KEY = '   \t\n  ';
      const { AnthropicProvider } = await import('../../src/llm/anthropic-provider.js');
      expect(() => new AnthropicProvider()).toThrow(
        'ANTHROPIC_API_KEY environment variable is not configured'
      );
    });

    it('trims whitespace from valid API key', async () => {
      const provider = await createProvider('  sk-valid-key  ');
      expect(provider.name).toBe('anthropic');
    });
  });

  describe('message mapping', () => {
    it('extracts system messages to top-level system param', async () => {
      const provider = await createProvider();
      const createMock = await getClientMock(provider);
      createMock.mockResolvedValue(makeSuccessResponse());

      const request: CompletionRequest = {
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hello' },
        ],
        model: 'claude-sonnet-4-6',
      };

      await provider.complete(request);

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'You are helpful.',
          messages: [{ role: 'user', content: 'Hello' }],
        })
      );
    });

    it('concatenates multiple system messages with double newline', async () => {
      const provider = await createProvider();
      const createMock = await getClientMock(provider);
      createMock.mockResolvedValue(makeSuccessResponse());

      const request: CompletionRequest = {
        messages: [
          { role: 'system', content: 'First instruction.' },
          { role: 'system', content: 'Second instruction.' },
          { role: 'user', content: 'Hello' },
        ],
        model: 'claude-sonnet-4-6',
      };

      await provider.complete(request);

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'First instruction.\n\nSecond instruction.',
        })
      );
    });

    it('preserves user/assistant message order', async () => {
      const provider = await createProvider();
      const createMock = await getClientMock(provider);
      createMock.mockResolvedValue(makeSuccessResponse());

      const request: CompletionRequest = {
        messages: [
          { role: 'system', content: 'System' },
          { role: 'user', content: 'First user' },
          { role: 'assistant', content: 'First assistant' },
          { role: 'user', content: 'Second user' },
        ],
        model: 'claude-sonnet-4-6',
      };

      await provider.complete(request);

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'user', content: 'First user' },
            { role: 'assistant', content: 'First assistant' },
            { role: 'user', content: 'Second user' },
          ],
        })
      );
    });

    it('omits system param when no system messages present', async () => {
      const provider = await createProvider();
      const createMock = await getClientMock(provider);
      createMock.mockResolvedValue(makeSuccessResponse());

      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'claude-sonnet-4-6',
      };

      await provider.complete(request);

      const callArgs = createMock.mock.calls[0]![0] as Record<string, unknown>;
      expect(callArgs.system).toBeUndefined();
    });
  });

  describe('parameter forwarding', () => {
    it('uses default maxTokens of 4096 when not specified', async () => {
      const provider = await createProvider();
      const createMock = await getClientMock(provider);
      createMock.mockResolvedValue(makeSuccessResponse());

      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'claude-sonnet-4-6',
      };

      await provider.complete(request);

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: 4096 })
      );
    });

    it('forwards custom maxTokens', async () => {
      const provider = await createProvider();
      const createMock = await getClientMock(provider);
      createMock.mockResolvedValue(makeSuccessResponse());

      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'claude-sonnet-4-6',
        maxTokens: 1024,
      };

      await provider.complete(request);

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: 1024 })
      );
    });

    it('forwards temperature when specified', async () => {
      const provider = await createProvider();
      const createMock = await getClientMock(provider);
      createMock.mockResolvedValue(makeSuccessResponse());

      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'claude-sonnet-4-6',
        temperature: 0.7,
      };

      await provider.complete(request);

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ temperature: 0.7 })
      );
    });

    it('omits temperature when not specified', async () => {
      const provider = await createProvider();
      const createMock = await getClientMock(provider);
      createMock.mockResolvedValue(makeSuccessResponse());

      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'claude-sonnet-4-6',
      };

      await provider.complete(request);

      const callArgs = createMock.mock.calls[0]![0] as Record<string, unknown>;
      expect(callArgs.temperature).toBeUndefined();
    });

    it('forwards stopSequences when specified', async () => {
      const provider = await createProvider();
      const createMock = await getClientMock(provider);
      createMock.mockResolvedValue(makeSuccessResponse());

      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'claude-sonnet-4-6',
        stopSequences: ['END', 'STOP'],
      };

      await provider.complete(request);

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ stop_sequences: ['END', 'STOP'] })
      );
    });

    it('omits stop_sequences when not specified', async () => {
      const provider = await createProvider();
      const createMock = await getClientMock(provider);
      createMock.mockResolvedValue(makeSuccessResponse());

      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'claude-sonnet-4-6',
      };

      await provider.complete(request);

      const callArgs = createMock.mock.calls[0]![0] as Record<string, unknown>;
      expect(callArgs.stop_sequences).toBeUndefined();
    });

    it('forwards model identifier to API', async () => {
      const provider = await createProvider();
      const createMock = await getClientMock(provider);
      createMock.mockResolvedValue(makeSuccessResponse());

      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'claude-haiku-4-20250514',
      };

      await provider.complete(request);

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'claude-haiku-4-20250514' })
      );
    });
  });

  describe('validation', () => {
    it('rejects empty messages array', async () => {
      const provider = await createProvider();

      const request: CompletionRequest = {
        messages: [],
        model: 'claude-sonnet-4-6',
      };

      await expect(provider.complete(request)).rejects.toThrow(
        'At least one message is required'
      );
    });

    it('rejects model not prefixed with claude-', async () => {
      const provider = await createProvider();

      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'gpt-4',
      };

      await expect(provider.complete(request)).rejects.toThrow(
        'Unsupported model: gpt-4'
      );
    });

    it('rejects maxTokens of 0', async () => {
      const provider = await createProvider();

      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'claude-sonnet-4-6',
        maxTokens: 0,
      };

      await expect(provider.complete(request)).rejects.toThrow(
        'maxTokens must be an integer between 1 and 128000'
      );
    });

    it('rejects maxTokens greater than 128000', async () => {
      const provider = await createProvider();

      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'claude-sonnet-4-6',
        maxTokens: 128001,
      };

      await expect(provider.complete(request)).rejects.toThrow(
        'maxTokens must be an integer between 1 and 128000'
      );
    });

    it('rejects non-integer maxTokens', async () => {
      const provider = await createProvider();

      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'claude-sonnet-4-6',
        maxTokens: 1024.5,
      };

      await expect(provider.complete(request)).rejects.toThrow(
        'maxTokens must be an integer between 1 and 128000'
      );
    });

    it('accepts maxTokens of 1 (minimum)', async () => {
      const provider = await createProvider();
      const createMock = await getClientMock(provider);
      createMock.mockResolvedValue(makeSuccessResponse());

      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'claude-sonnet-4-6',
        maxTokens: 1,
      };

      await provider.complete(request);

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: 1 })
      );
    });

    it('accepts maxTokens of 128000 (maximum)', async () => {
      const provider = await createProvider();
      const createMock = await getClientMock(provider);
      createMock.mockResolvedValue(makeSuccessResponse());

      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'claude-sonnet-4-6',
        maxTokens: 128000,
      };

      await provider.complete(request);

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: 128000 })
      );
    });
  });

  describe('response extraction', () => {
    it('extracts text content from first text block', async () => {
      const provider = await createProvider();
      const createMock = await getClientMock(provider);
      createMock.mockResolvedValue({
        content: [{ type: 'text', text: 'Generated response' }],
        usage: { input_tokens: 15, output_tokens: 8 },
      });

      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'claude-sonnet-4-6',
      };

      const response = await provider.complete(request);
      expect(response.content).toBe('Generated response');
    });

    it('extracts token usage correctly', async () => {
      const provider = await createProvider();
      const createMock = await getClientMock(provider);
      createMock.mockResolvedValue(makeSuccessResponse('text', 100, 50));

      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'claude-sonnet-4-6',
      };

      const response = await provider.complete(request);
      expect(response.usage).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });
    });

    it('returns empty content when no text block in response', async () => {
      const provider = await createProvider();
      const createMock = await getClientMock(provider);
      createMock.mockResolvedValue({
        content: [{ type: 'tool_use', id: 'tool1', name: 'test', input: {} }],
        usage: { input_tokens: 5, output_tokens: 3 },
      });

      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'claude-sonnet-4-6',
      };

      const response = await provider.complete(request);
      expect(response.content).toBe('');
    });
  });

  describe('error wrapping', () => {
    it('wraps HTTP 401 into authentication error', async () => {
      const provider = await createProvider();
      const createMock = await getClientMock(provider);
      const authError = new Error('Unauthorized');
      (authError as unknown as { status: number }).status = 401;
      createMock.mockRejectedValue(authError);

      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'claude-sonnet-4-6',
      };

      await expect(provider.complete(request)).rejects.toThrow(
        'Authentication failed: API key is invalid or unauthorized'
      );
    });

    it('wraps HTTP 429 into rate limit error', async () => {
      const provider = await createProvider();
      const createMock = await getClientMock(provider);
      const rateLimitError = new Error('Rate limited');
      (rateLimitError as unknown as { status: number }).status = 429;
      createMock.mockRejectedValue(rateLimitError);

      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'claude-sonnet-4-6',
      };

      await expect(provider.complete(request)).rejects.toThrow(
        'Rate limit exceeded. Please retry later.'
      );
    });

    it('wraps HTTP 500 into service unavailable error', async () => {
      const provider = await createProvider();
      const createMock = await getClientMock(provider);
      const serverError = new Error('Internal Server Error');
      (serverError as unknown as { status: number }).status = 500;
      createMock.mockRejectedValue(serverError);

      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'claude-sonnet-4-6',
      };

      await expect(provider.complete(request)).rejects.toThrow(
        'LLM service is temporarily unavailable'
      );
    });

    it('wraps unknown errors into generic message', async () => {
      const provider = await createProvider();
      const createMock = await getClientMock(provider);
      createMock.mockRejectedValue(new Error('Some internal SDK error with stack trace'));

      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'claude-sonnet-4-6',
      };

      await expect(provider.complete(request)).rejects.toThrow('LLM request failed');
    });

    it('does not expose provider-specific error details', async () => {
      const provider = await createProvider();
      const createMock = await getClientMock(provider);
      const detailedError = new Error('Anthropic API error: invalid_request_error at /v1/messages');
      createMock.mockRejectedValue(detailedError);

      const request: CompletionRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'claude-sonnet-4-6',
      };

      try {
        await provider.complete(request);
      } catch (error) {
        expect((error as Error).message).toBe('LLM request failed');
        expect((error as Error).message).not.toContain('Anthropic');
        expect((error as Error).message).not.toContain('/v1/messages');
      }
    });
  });
});
