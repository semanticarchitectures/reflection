/**
 * Provider Registry for environment-based LLM provider resolution.
 *
 * Resolves the active LLM provider and stage-specific configuration
 * (model, maxTokens) from environment variables. Provides a centralized
 * point for provider management, avoiding scattered env var reads
 * across pipeline stages.
 */

import { LLMProvider } from './interfaces.js';

/**
 * The three pipeline stages that can be individually configured.
 */
export type PipelineStage = 'planner' | 'generator' | 'clarifier';

/**
 * Configuration for a specific pipeline stage, resolved from environment variables.
 */
export interface StageConfig {
  /** The model identifier to use for this stage. */
  model: string;
  /** The maximum number of tokens for this stage's completion calls. */
  maxTokens: number;
}

/** Default model when no environment variable is configured. */
const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

/** Default maxTokens when no valid environment variable is configured. */
const DEFAULT_MAX_TOKENS = 4096;

/** Minimum valid maxTokens value. */
const MIN_MAX_TOKENS = 1;

/** Maximum valid maxTokens value. */
const MAX_MAX_TOKENS = 128000;

/** Maps pipeline stages to their corresponding model environment variable names. */
const STAGE_MODEL_ENV_VARS: Record<PipelineStage, string> = {
  planner: 'LLM_MODEL_PLANNER',
  generator: 'LLM_MODEL_GENERATOR',
  clarifier: 'LLM_MODEL_CLARIFIER',
};

/** Maps pipeline stages to their corresponding maxTokens environment variable names. */
const STAGE_MAX_TOKENS_ENV_VARS: Record<PipelineStage, string> = {
  planner: 'LLM_MAX_TOKENS_PLANNER',
  generator: 'LLM_MAX_TOKENS_GENERATOR',
  clarifier: 'LLM_MAX_TOKENS_CLARIFIER',
};

/**
 * Centralized registry for LLM provider resolution and stage configuration.
 *
 * Providers are registered by name and resolved via the `LLM_PROVIDER`
 * environment variable. Stage-specific model and maxTokens settings are
 * resolved from environment variables with sensible defaults.
 */
export class ProviderRegistry {
  private providers: Map<string, LLMProvider> = new Map();

  /**
   * Register an LLM provider implementation.
   *
   * @param provider - The provider to register. Its `name` property is used as the lookup key.
   */
  register(provider: LLMProvider): void {
    this.providers.set(provider.name, provider);
  }

  /**
   * Resolve the active LLM provider from the `LLM_PROVIDER` environment variable.
   *
   * @returns The matching provider, or `null` if `LLM_PROVIDER` is unset, empty, or whitespace-only.
   * @throws Error if `LLM_PROVIDER` is set to a value that doesn't match any registered provider.
   */
  getActiveProvider(): LLMProvider | null {
    const providerName = process.env.LLM_PROVIDER?.trim();

    if (!providerName) {
      return null;
    }

    const provider = this.providers.get(providerName);
    if (!provider) {
      const available = Array.from(this.providers.keys());
      throw new Error(
        `Unknown LLM provider "${providerName}". Available providers: ${available.length > 0 ? available.join(', ') : '(none registered)'}`
      );
    }

    return provider;
  }

  /**
   * Resolve the model and maxTokens configuration for a pipeline stage.
   *
   * Model resolution order:
   * 1. Stage-specific env var (e.g., `LLM_MODEL_PLANNER`)
   * 2. `LLM_MODEL_DEFAULT`
   * 3. Hardcoded fallback: "claude-sonnet-4-20250514"
   *
   * MaxTokens resolution order:
   * 1. Stage-specific env var (e.g., `LLM_MAX_TOKENS_PLANNER`) — must be a valid integer in [1, 128000]
   * 2. Hardcoded fallback: 4096
   *
   * @param stage - The pipeline stage to get configuration for.
   * @returns The resolved stage configuration.
   */
  getStageConfig(stage: PipelineStage): StageConfig {
    const model = this.resolveModel(stage);
    const maxTokens = this.resolveMaxTokens(stage);

    return { model, maxTokens };
  }

  private resolveModel(stage: PipelineStage): string {
    const stageEnvVar = STAGE_MODEL_ENV_VARS[stage];
    const stageValue = process.env[stageEnvVar]?.trim();

    if (stageValue) {
      return stageValue;
    }

    const defaultValue = process.env.LLM_MODEL_DEFAULT?.trim();
    if (defaultValue) {
      return defaultValue;
    }

    return DEFAULT_MODEL;
  }

  private resolveMaxTokens(stage: PipelineStage): number {
    const stageEnvVar = STAGE_MAX_TOKENS_ENV_VARS[stage];
    const stageValue = process.env[stageEnvVar]?.trim();

    if (stageValue) {
      const parsed = Number(stageValue);
      if (Number.isInteger(parsed) && parsed >= MIN_MAX_TOKENS && parsed <= MAX_MAX_TOKENS) {
        return parsed;
      }
      // Invalid value — ignore and use default
    }

    return DEFAULT_MAX_TOKENS;
  }
}
