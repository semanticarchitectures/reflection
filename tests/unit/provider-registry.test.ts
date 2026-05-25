import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProviderRegistry } from '../../src/llm/provider-registry.js';
import { LLMProvider, CompletionRequest, CompletionResponse } from '../../src/llm/interfaces.js';

/**
 * Creates a mock LLM provider with the given name.
 */
function createMockProvider(name: string): LLMProvider {
  return {
    name,
    complete: async (_request: CompletionRequest): Promise<CompletionResponse> => ({
      content: 'mock response',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    }),
  };
}

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;
  const originalEnv = process.env;

  beforeEach(() => {
    registry = new ProviderRegistry();
    process.env = { ...originalEnv };
    // Clear all LLM-related env vars
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_MODEL_DEFAULT;
    delete process.env.LLM_MODEL_PLANNER;
    delete process.env.LLM_MODEL_GENERATOR;
    delete process.env.LLM_MODEL_CLARIFIER;
    delete process.env.LLM_MAX_TOKENS_PLANNER;
    delete process.env.LLM_MAX_TOKENS_GENERATOR;
    delete process.env.LLM_MAX_TOKENS_CLARIFIER;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('register()', () => {
    it('should register a provider by name', () => {
      const provider = createMockProvider('anthropic');
      registry.register(provider);

      process.env.LLM_PROVIDER = 'anthropic';
      expect(registry.getActiveProvider()).toBe(provider);
    });

    it('should allow registering multiple providers', () => {
      const anthropic = createMockProvider('anthropic');
      const openai = createMockProvider('openai');
      registry.register(anthropic);
      registry.register(openai);

      process.env.LLM_PROVIDER = 'openai';
      expect(registry.getActiveProvider()).toBe(openai);
    });

    it('should overwrite a provider if registered with the same name', () => {
      const first = createMockProvider('anthropic');
      const second = createMockProvider('anthropic');
      registry.register(first);
      registry.register(second);

      process.env.LLM_PROVIDER = 'anthropic';
      expect(registry.getActiveProvider()).toBe(second);
    });
  });

  describe('getActiveProvider()', () => {
    it('should return null when LLM_PROVIDER is not set', () => {
      registry.register(createMockProvider('anthropic'));
      expect(registry.getActiveProvider()).toBeNull();
    });

    it('should return null when LLM_PROVIDER is empty string', () => {
      registry.register(createMockProvider('anthropic'));
      process.env.LLM_PROVIDER = '';
      expect(registry.getActiveProvider()).toBeNull();
    });

    it('should return null when LLM_PROVIDER is whitespace only', () => {
      registry.register(createMockProvider('anthropic'));
      process.env.LLM_PROVIDER = '   ';
      expect(registry.getActiveProvider()).toBeNull();
    });

    it('should return null when LLM_PROVIDER is tab/newline whitespace', () => {
      registry.register(createMockProvider('anthropic'));
      process.env.LLM_PROVIDER = '\t\n  ';
      expect(registry.getActiveProvider()).toBeNull();
    });

    it('should return the matching provider when LLM_PROVIDER is set', () => {
      const provider = createMockProvider('anthropic');
      registry.register(provider);
      process.env.LLM_PROVIDER = 'anthropic';
      expect(registry.getActiveProvider()).toBe(provider);
    });

    it('should trim whitespace from LLM_PROVIDER value', () => {
      const provider = createMockProvider('anthropic');
      registry.register(provider);
      process.env.LLM_PROVIDER = '  anthropic  ';
      expect(registry.getActiveProvider()).toBe(provider);
    });

    it('should throw error when LLM_PROVIDER does not match any registered provider', () => {
      registry.register(createMockProvider('anthropic'));
      process.env.LLM_PROVIDER = 'unknown-provider';
      expect(() => registry.getActiveProvider()).toThrow(
        'Unknown LLM provider "unknown-provider". Available providers: anthropic'
      );
    });

    it('should list all available providers in error message', () => {
      registry.register(createMockProvider('anthropic'));
      registry.register(createMockProvider('openai'));
      process.env.LLM_PROVIDER = 'gemini';
      expect(() => registry.getActiveProvider()).toThrow(/Available providers: anthropic, openai/);
    });

    it('should show "(none registered)" when no providers are registered', () => {
      process.env.LLM_PROVIDER = 'anthropic';
      expect(() => registry.getActiveProvider()).toThrow(
        'Unknown LLM provider "anthropic". Available providers: (none registered)'
      );
    });
  });

  describe('getStageConfig() - model resolution', () => {
    it('should use hardcoded default when no env vars are set', () => {
      const config = registry.getStageConfig('planner');
      expect(config.model).toBe('claude-sonnet-4-6');
    });

    it('should use LLM_MODEL_DEFAULT when stage-specific is not set', () => {
      process.env.LLM_MODEL_DEFAULT = 'claude-haiku-4-20250514';
      const config = registry.getStageConfig('planner');
      expect(config.model).toBe('claude-haiku-4-20250514');
    });

    it('should use stage-specific model over LLM_MODEL_DEFAULT', () => {
      process.env.LLM_MODEL_DEFAULT = 'claude-haiku-4-20250514';
      process.env.LLM_MODEL_PLANNER = 'claude-opus-4-20250514';
      const config = registry.getStageConfig('planner');
      expect(config.model).toBe('claude-opus-4-20250514');
    });

    it('should resolve LLM_MODEL_GENERATOR for generator stage', () => {
      process.env.LLM_MODEL_GENERATOR = 'claude-opus-4-20250514';
      const config = registry.getStageConfig('generator');
      expect(config.model).toBe('claude-opus-4-20250514');
    });

    it('should resolve LLM_MODEL_CLARIFIER for clarifier stage', () => {
      process.env.LLM_MODEL_CLARIFIER = 'claude-haiku-4-20250514';
      const config = registry.getStageConfig('clarifier');
      expect(config.model).toBe('claude-haiku-4-20250514');
    });

    it('should fall through to LLM_MODEL_DEFAULT when stage-specific is empty', () => {
      process.env.LLM_MODEL_PLANNER = '';
      process.env.LLM_MODEL_DEFAULT = 'claude-haiku-4-20250514';
      const config = registry.getStageConfig('planner');
      expect(config.model).toBe('claude-haiku-4-20250514');
    });

    it('should fall through to LLM_MODEL_DEFAULT when stage-specific is whitespace', () => {
      process.env.LLM_MODEL_PLANNER = '   ';
      process.env.LLM_MODEL_DEFAULT = 'claude-haiku-4-20250514';
      const config = registry.getStageConfig('planner');
      expect(config.model).toBe('claude-haiku-4-20250514');
    });

    it('should fall through to hardcoded default when LLM_MODEL_DEFAULT is empty', () => {
      process.env.LLM_MODEL_DEFAULT = '';
      const config = registry.getStageConfig('planner');
      expect(config.model).toBe('claude-sonnet-4-6');
    });

    it('should fall through to hardcoded default when LLM_MODEL_DEFAULT is whitespace', () => {
      process.env.LLM_MODEL_DEFAULT = '   ';
      const config = registry.getStageConfig('generator');
      expect(config.model).toBe('claude-sonnet-4-6');
    });

    it('should allow different models for different stages', () => {
      process.env.LLM_MODEL_PLANNER = 'model-a';
      process.env.LLM_MODEL_GENERATOR = 'model-b';
      process.env.LLM_MODEL_CLARIFIER = 'model-c';

      expect(registry.getStageConfig('planner').model).toBe('model-a');
      expect(registry.getStageConfig('generator').model).toBe('model-b');
      expect(registry.getStageConfig('clarifier').model).toBe('model-c');
    });
  });

  describe('getStageConfig() - maxTokens resolution', () => {
    it('should use default 4096 when no env vars are set', () => {
      const config = registry.getStageConfig('planner');
      expect(config.maxTokens).toBe(4096);
    });

    it('should use stage-specific maxTokens when set to valid integer', () => {
      process.env.LLM_MAX_TOKENS_PLANNER = '8192';
      const config = registry.getStageConfig('planner');
      expect(config.maxTokens).toBe(8192);
    });

    it('should resolve LLM_MAX_TOKENS_GENERATOR for generator stage', () => {
      process.env.LLM_MAX_TOKENS_GENERATOR = '16000';
      const config = registry.getStageConfig('generator');
      expect(config.maxTokens).toBe(16000);
    });

    it('should resolve LLM_MAX_TOKENS_CLARIFIER for clarifier stage', () => {
      process.env.LLM_MAX_TOKENS_CLARIFIER = '2048';
      const config = registry.getStageConfig('clarifier');
      expect(config.maxTokens).toBe(2048);
    });

    it('should accept minimum valid value of 1', () => {
      process.env.LLM_MAX_TOKENS_PLANNER = '1';
      const config = registry.getStageConfig('planner');
      expect(config.maxTokens).toBe(1);
    });

    it('should accept maximum valid value of 128000', () => {
      process.env.LLM_MAX_TOKENS_PLANNER = '128000';
      const config = registry.getStageConfig('planner');
      expect(config.maxTokens).toBe(128000);
    });

    it('should ignore value of 0 and use default', () => {
      process.env.LLM_MAX_TOKENS_PLANNER = '0';
      const config = registry.getStageConfig('planner');
      expect(config.maxTokens).toBe(4096);
    });

    it('should ignore negative values and use default', () => {
      process.env.LLM_MAX_TOKENS_PLANNER = '-1';
      const config = registry.getStageConfig('planner');
      expect(config.maxTokens).toBe(4096);
    });

    it('should ignore values exceeding 128000 and use default', () => {
      process.env.LLM_MAX_TOKENS_PLANNER = '200000';
      const config = registry.getStageConfig('planner');
      expect(config.maxTokens).toBe(4096);
    });

    it('should ignore non-numeric strings and use default', () => {
      process.env.LLM_MAX_TOKENS_PLANNER = 'abc';
      const config = registry.getStageConfig('planner');
      expect(config.maxTokens).toBe(4096);
    });

    it('should ignore floating point values and use default', () => {
      process.env.LLM_MAX_TOKENS_PLANNER = '4096.5';
      const config = registry.getStageConfig('planner');
      expect(config.maxTokens).toBe(4096);
    });

    it('should ignore empty string and use default', () => {
      process.env.LLM_MAX_TOKENS_PLANNER = '';
      const config = registry.getStageConfig('planner');
      expect(config.maxTokens).toBe(4096);
    });

    it('should ignore whitespace-only string and use default', () => {
      process.env.LLM_MAX_TOKENS_PLANNER = '   ';
      const config = registry.getStageConfig('planner');
      expect(config.maxTokens).toBe(4096);
    });

    it('should allow different maxTokens for different stages', () => {
      process.env.LLM_MAX_TOKENS_PLANNER = '2048';
      process.env.LLM_MAX_TOKENS_GENERATOR = '16000';
      process.env.LLM_MAX_TOKENS_CLARIFIER = '1024';

      expect(registry.getStageConfig('planner').maxTokens).toBe(2048);
      expect(registry.getStageConfig('generator').maxTokens).toBe(16000);
      expect(registry.getStageConfig('clarifier').maxTokens).toBe(1024);
    });
  });

  describe('getStageConfig() - combined model and maxTokens', () => {
    it('should resolve both model and maxTokens independently', () => {
      process.env.LLM_MODEL_PLANNER = 'custom-model';
      process.env.LLM_MAX_TOKENS_PLANNER = '8192';

      const config = registry.getStageConfig('planner');
      expect(config.model).toBe('custom-model');
      expect(config.maxTokens).toBe(8192);
    });

    it('should use defaults for both when nothing is configured', () => {
      const config = registry.getStageConfig('generator');
      expect(config.model).toBe('claude-sonnet-4-6');
      expect(config.maxTokens).toBe(4096);
    });

    it('should mix stage-specific and defaults', () => {
      process.env.LLM_MODEL_DEFAULT = 'default-model';
      process.env.LLM_MAX_TOKENS_GENERATOR = 'invalid';

      const config = registry.getStageConfig('generator');
      expect(config.model).toBe('default-model');
      expect(config.maxTokens).toBe(4096);
    });
  });
});
