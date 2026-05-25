#!/usr/bin/env node
/**
 * CLI entry point for the Context Generation system.
 *
 * Usage:
 *   npx tsx src/cli.ts --topic "Your topic" --use-case "How it will be used" --output ./output
 *
 * Options:
 *   --topic, -t       Topic description (required)
 *   --use-case, -u    Use case description (required)
 *   --output, -o      Output directory (default: ./context-output)
 *   --skip-clarify    Skip the clarification phase
 *   --help, -h        Show help
 */

import * as readline from 'node:readline';
import { runPipeline, ClarificationCallback } from './pipeline.js';
import { ProgressReporter } from './reporters/progress-reporter.js';
import { ClarificationQuestion } from './models/interfaces.js';

function parseArgs(args: string[]): {
  topic: string;
  useCase: string;
  outputDir: string;
  skipClarification: boolean;
} {
  let topic = '';
  let useCase = '';
  let outputDir = './context-output';
  let skipClarification = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--topic':
      case '-t':
        topic = args[++i] ?? '';
        break;
      case '--use-case':
      case '-u':
        useCase = args[++i] ?? '';
        break;
      case '--output':
      case '-o':
        outputDir = args[++i] ?? './context-output';
        break;
      case '--skip-clarify':
        skipClarification = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
    }
  }

  return { topic, useCase, outputDir, skipClarification };
}

function printHelp(): void {
  console.log(`
Context Generation CLI

Usage:
  npx tsx src/cli.ts --topic "Your topic" --use-case "How it will be used" [options]

Options:
  --topic, -t       Topic description (required)
  --use-case, -u    Use case description (required)
  --output, -o      Output directory (default: ./context-output)
  --skip-clarify    Skip the clarification question phase
  --help, -h        Show this help message

Examples:
  npx tsx src/cli.ts -t "Rust ownership model" -u "Teaching a junior developer" -o ./rust-context
  npx tsx src/cli.ts -t "Kubernetes networking" -u "Context for a coding assistant" --skip-clarify
`);
}

function askQuestion(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function interactiveClarification(
  rl: readline.Interface
): Promise<ClarificationCallback> {
  return async (questions: ClarificationQuestion[]): Promise<Map<string, string>> => {
    const answers = new Map<string, string>();
    console.log('\n--- Clarification Questions ---\n');
    for (const q of questions) {
      const answer = await askQuestion(rl, `${q.text}\n> `);
      answers.set(q.id, answer);
    }
    console.log('');
    return answers;
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.topic) {
    console.error('Error: --topic is required. Use --help for usage information.');
    process.exit(1);
  }

  if (!args.useCase) {
    console.error('Error: --use-case is required. Use --help for usage information.');
    process.exit(1);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const reporter = new ProgressReporter();

  let clarificationCallback: ClarificationCallback | undefined;
  if (!args.skipClarification) {
    clarificationCallback = await interactiveClarification(rl);
  }

  console.log(`\nTopic: ${args.topic}`);
  console.log(`Use case: ${args.useCase}`);
  console.log(`Output: ${args.outputDir}`);
  console.log(`Clarification: ${args.skipClarification ? 'skipped' : 'interactive'}`);

  // Display LLM configuration
  const llmProvider = process.env.LLM_PROVIDER?.trim();
  if (llmProvider) {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    const model = process.env.LLM_MODEL_DEFAULT?.trim() || 'claude-sonnet-4-20250514';
    console.log(`LLM Provider: ${llmProvider}`);
    console.log(`LLM Model: ${model}`);
    console.log(`API Key: ${apiKey ? apiKey.slice(0, 10) + '...' + apiKey.slice(-4) : '(not set)'}`);
  } else {
    console.log(`LLM Provider: none (using heuristics)`);
  }
  console.log('');

  const result = await runPipeline({
    topic: args.topic,
    useCase: args.useCase,
    outputDir: args.outputDir,
    skipClarification: args.skipClarification,
    ...(clarificationCallback ? { clarificationCallback } : {}),
    progressReporter: reporter,
  });

  rl.close();

  if (!result.success) {
    console.error(`\nFailed: ${result.error}`);
    process.exit(1);
  }

  console.log(`\nDone! ${result.session.generatedFiles.length} files written to ${args.outputDir}`);

  // Show generation method summary
  const llmFiles = result.session.generatedFiles.filter(f => f.generationMethod === 'llm');
  const heuristicFiles = result.session.generatedFiles.filter(f => f.generationMethod !== 'llm');
  if (llmFiles.length > 0) {
    const model = llmFiles[0]?.modelUsed ?? 'unknown';
    console.log(`  LLM-generated: ${llmFiles.length} files (model: ${model})`);
  }
  if (heuristicFiles.length > 0) {
    console.log(`  Heuristic-generated: ${heuristicFiles.length} files`);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
