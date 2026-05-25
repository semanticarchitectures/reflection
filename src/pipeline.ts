/**
 * Pipeline orchestrator module.
 *
 * Orchestrates the full context generation flow:
 * validate → clarify → plan → generate → index → write
 *
 * Wires all components together with proper error handling at each stage.
 * Handles partial generation by preserving successful files and reporting failures.
 *
 * Requirements: 1.3, 3.6, 5.4
 */

import { mkdir, writeFile as fsWriteFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  validateTopicDescription,
  validateUseCaseDescription,
} from './validators/input-validator.js';
import { ClarificationAgent } from './agents/clarification-agent.js';
import { planContextSet } from './planners/content-planner.js';
import { generateFile } from './generators/file-generator.js';
import { buildIndex } from './writers/index-builder.js';
import { writeContextSet } from './writers/output-writer.js';
import { ProgressReporter } from './reporters/progress-reporter.js';
import { ClarificationQuestion, TopicScope } from './models/interfaces.js';
import { GenerationSession } from './session.js';
import { ProviderRegistry } from './llm/provider-registry.js';
import { AnthropicProvider } from './llm/anthropic-provider.js';

/**
 * Callback type for user interaction during clarification.
 * Receives a batch of questions and returns a map of question ID → answer.
 */
export type ClarificationCallback = (
  questions: ClarificationQuestion[]
) => Promise<Map<string, string>>;

/** Options for configuring the pipeline. */
export interface PipelineOptions {
  /** Topic description to generate context for. */
  topic: string;
  /** Use case description explaining how the context will be used. */
  useCase: string;
  /** Output directory where generated files will be written. */
  outputDir: string;
  /** Progress reporter for generation feedback. */
  progressReporter?: ProgressReporter;
  /** Callback for user interaction during clarification. */
  clarificationCallback?: ClarificationCallback;
  /** If true, skip the clarification phase entirely. */
  skipClarification?: boolean;
}

/** Result of a pipeline execution. */
export interface PipelineResult {
  /** Whether the pipeline completed successfully (at least some files generated). */
  success: boolean;
  /** The completed generation session with all accumulated state. */
  session: GenerationSession;
  /** Error message if the pipeline failed entirely. */
  error?: string;
}

/**
 * Runs the full context generation pipeline.
 *
 * Orchestrates: validate → clarify → plan → generate → index → write
 *
 * Error handling:
 * - Validation errors halt the pipeline immediately.
 * - Clarification errors halt the pipeline (user interaction required).
 * - Planning errors halt the pipeline.
 * - Individual file generation errors are recorded but don't halt the pipeline.
 * - If all files fail to generate, the pipeline reports complete failure.
 * - Index and write errors are recorded but successful files are preserved.
 *
 * @param options - Pipeline configuration options
 * @returns A PipelineResult with the session and success status
 */
export async function runPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const {
    topic,
    useCase,
    outputDir,
    progressReporter,
    clarificationCallback,
    skipClarification = false,
  } = options;

  const session = new GenerationSession(topic, useCase, outputDir);

  // Initialize LLM provider registry
  const registry = initializeProviderRegistry();

  // Stage 1: Validate inputs
  const validationError = validateInputs(session);
  if (validationError) {
    session.setFailed();
    return { success: false, session, error: validationError };
  }
  session.setValidated();

  // Stage 1.5: Pre-check output directory writability
  const dirError = await checkOutputDirectoryWritable(outputDir);
  if (dirError) {
    session.addError('writing', dirError);
    session.setFailed();
    return { success: false, session, error: dirError };
  }

  // Stage 2: Clarification
  try {
    const scope = await runClarification(
      session,
      skipClarification,
      clarificationCallback,
      registry
    );
    session.setScope(scope);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    session.addError('clarification', message);
    session.setFailed();
    return { success: false, session, error: `Clarification failed: ${message}` };
  }

  // Stage 3: Plan content
  try {
    const plan = await planContextSet(session.scope!, registry);
    session.setPlan(plan);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    session.addError('planning', message);
    session.setFailed();
    return { success: false, session, error: `Planning failed: ${message}` };
  }

  // Stage 4: Generate files
  const plan = session.plan!;
  session.setGenerating();
  progressReporter?.onStart(plan.estimatedTotal);

  let completedCount = 0;
  for (const plannedFile of plan.files) {
    try {
      const generated = await generateFile(
        plannedFile,
        session.scope!,
        session.generatedFiles,
        registry
      );
      session.addGeneratedFile(generated);
      completedCount++;
      progressReporter?.onFileComplete(
        generated.filename,
        completedCount,
        plan.estimatedTotal,
        generated.generationMethod ?? 'heuristic'
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      session.addError('generation', message, plannedFile.filename);
      progressReporter?.onFileError(plannedFile.filename, message);
    }
  }

  // If all files failed, report complete failure
  if (session.generatedFiles.length === 0) {
    session.setFailed();
    progressReporter?.onComplete([]);
    return {
      success: false,
      session,
      error: 'All files failed to generate. See session errors for details.',
    };
  }

  session.setGenerated();

  // Stage 5: Build index
  let indexContent: string;
  try {
    indexContent = buildIndex(session.generatedFiles);
    session.setIndexed();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    session.addError('indexing', message);
    // Index failure is non-fatal — files are still available
    indexContent = buildFallbackIndex(session);
  }

  // Stage 6: Write output
  try {
    const writeResults = await writeContextSet(
      outputDir,
      session.generatedFiles,
      indexContent
    );

    // Check for write failures
    const writeFailures = writeResults.filter((r) => !r.success);
    for (const failure of writeFailures) {
      session.addError('writing', failure.error ?? 'Unknown write error');
    }

    // If at least some files were written successfully, consider it a success
    const writeSuccesses = writeResults.filter((r) => r.success);
    if (writeSuccesses.length > 0) {
      session.setWritten();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    session.addError('writing', message);
    // Write failure doesn't invalidate the generated content in the session
  }

  progressReporter?.onComplete(session.generatedFiles);

  return { success: true, session };
}

/**
 * Validates topic and use case inputs.
 * Returns an error message if validation fails, or null if valid.
 */
function validateInputs(session: GenerationSession): string | null {
  const topicResult = validateTopicDescription(session.topicDescription);
  if (!topicResult.valid) {
    session.addError('validation', topicResult.error ?? 'Invalid topic description');
    return topicResult.error ?? 'Invalid topic description';
  }

  const useCaseResult = validateUseCaseDescription(session.useCaseDescription);
  if (!useCaseResult.valid) {
    session.addError('validation', useCaseResult.error ?? 'Invalid use case description');
    return useCaseResult.error ?? 'Invalid use case description';
  }

  return null;
}

/**
 * Runs the clarification phase.
 *
 * If skipClarification is true, returns a TopicScope built from the raw inputs.
 * If a clarificationCallback is provided, drives the interactive clarification loop.
 * Otherwise, uses the ClarificationAgent with no user interaction (processes with no answers).
 */
async function runClarification(
  session: GenerationSession,
  skipClarification: boolean,
  clarificationCallback?: ClarificationCallback,
  registry?: ProviderRegistry
): Promise<TopicScope> {
  if (skipClarification) {
    return {
      originalTopic: session.topicDescription,
      originalUseCase: session.useCaseDescription,
      refinements: [],
      summary: `Topic: ${session.topicDescription}. Use case: ${session.useCaseDescription}`,
    };
  }

  const agent = new ClarificationAgent(
    session.topicDescription,
    session.useCaseDescription,
    registry
  );

  if (clarificationCallback) {
    // Interactive clarification loop
    while (!agent.isComplete()) {
      const questions = await agent.generateQuestions();
      if (questions.length === 0) {
        break;
      }
      const answers = await clarificationCallback(questions);
      agent.submitAnswers(answers);
    }
  }

  return agent.processAnswers();
}

/**
 * Builds a minimal fallback index when the IndexBuilder fails.
 * Lists files by filename without descriptions.
 */
function buildFallbackIndex(session: GenerationSession): string {
  const lines: string[] = ['# Index', ''];
  for (const file of session.generatedFiles) {
    lines.push(`- [${file.title}](./${file.filename})`);
  }
  return lines.join('\n');
}

/**
 * Initializes the ProviderRegistry and registers available providers.
 *
 * If `LLM_PROVIDER` is set to "anthropic", attempts to construct and register
 * the AnthropicProvider. If construction fails (e.g., missing API key), logs a
 * warning and returns an empty registry (no-provider mode = heuristic fallback).
 *
 * @returns A ProviderRegistry instance, possibly with no providers registered.
 */
function initializeProviderRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();

  const providerName = process.env.LLM_PROVIDER?.trim();
  if (!providerName) {
    return registry;
  }

  if (providerName === 'anthropic') {
    try {
      const provider = new AnthropicProvider();
      registry.register(provider);
      console.log(`[pipeline] LLM provider initialized: anthropic`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[pipeline] Failed to initialize Anthropic provider: ${message}. Falling back to heuristic mode.`);
    }
  } else {
    console.warn(`[pipeline] Unknown LLM_PROVIDER "${providerName}". Supported: anthropic. Falling back to heuristic mode.`);
  }

  return registry;
}

/**
 * Checks whether the output directory is writable before generation begins.
 *
 * If the directory exists, verifies write permission.
 * If it doesn't exist, verifies the parent directory is writable (so the
 * directory can be created later).
 *
 * @returns An error message if the directory is not writable, or null if OK.
 */
async function checkOutputDirectoryWritable(outputDir: string): Promise<string | null> {
  try {
    // Try to create the directory (recursive, no-op if it already exists)
    await mkdir(outputDir, { recursive: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Output directory is not writable: ${message}`;
  }

  // Verify we can actually write to the directory
  const testFile = join(outputDir, `.write-test-${Date.now()}.tmp`);
  try {
    await fsWriteFile(testFile, '', 'utf-8');
    await unlink(testFile);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Output directory is not writable: ${message}`;
  }

  return null;
}
