import { TopicScope, ContentPlan, PlannedFile } from '../models/interfaces.js';
import { MIN_FILES, MAX_FILES, MAX_FILENAME_LENGTH } from '../models/types.js';
import { generateFilename } from '../generators/filename-generator.js';
import { ProviderRegistry } from '../llm/provider-registry.js';
import { parseAndValidate } from '../llm/json-parser.js';
import { CompletionMessage } from '../llm/interfaces.js';

/**
 * Determines the structure of a context set — how many files, what subtopics,
 * and how they cross-reference each other.
 */

/** Kebab-case filename pattern: lowercase alphanumeric segments separated by hyphens, ending in .md */
const KEBAB_CASE_FILENAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*\.md$/;

/**
 * Type guard that validates a parsed JSON object conforms to the ContentPlan structure.
 *
 * Checks:
 * - Has a `files` array with 2–10 entries
 * - Each entry has non-empty subtopic and description
 * - Each filename matches kebab-case pattern with .md extension, ≤60 chars
 * - relatedFiles only reference filenames within the same plan
 */
function isValidContentPlan(parsed: unknown): parsed is ContentPlan {
  if (typeof parsed !== 'object' || parsed === null) return false;

  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.files)) return false;

  const files = obj.files as unknown[];
  if (files.length < MIN_FILES || files.length > MAX_FILES) return false;

  // Collect all filenames first for relatedFiles validation
  const allFilenames = new Set<string>();
  for (const entry of files) {
    if (typeof entry !== 'object' || entry === null) return false;
    const file = entry as Record<string, unknown>;
    if (typeof file.filename !== 'string') return false;
    allFilenames.add(file.filename);
  }

  // Validate each entry
  for (const entry of files) {
    const file = entry as Record<string, unknown>;

    // Non-empty subtopic
    if (typeof file.subtopic !== 'string' || file.subtopic.trim().length === 0) return false;

    // Non-empty description
    if (typeof file.description !== 'string' || file.description.trim().length === 0) return false;

    // Valid kebab-case filename with .md extension, ≤60 chars
    const filename = file.filename as string;
    if (filename.length > MAX_FILENAME_LENGTH) return false;
    if (!KEBAB_CASE_FILENAME_PATTERN.test(filename)) return false;

    // relatedFiles must be an array of strings referencing filenames within the plan
    if (!Array.isArray(file.relatedFiles)) return false;
    for (const ref of file.relatedFiles) {
      if (typeof ref !== 'string') return false;
      if (!allFilenames.has(ref)) return false;
    }
  }

  return true;
}

/**
 * Builds a structured prompt from a TopicScope requesting a content plan from the LLM.
 */
function buildContentPlanPrompt(scope: TopicScope): CompletionMessage[] {
  const systemMessage: CompletionMessage = {
    role: 'system',
    content: `You are a content planning assistant. Given a topic scope, you produce a structured content plan as a JSON object. The plan organizes the topic into distinct subtopics, each mapped to a markdown file.

Rules for the output:
- Return ONLY a JSON object with a "files" array
- The "files" array must contain between ${MIN_FILES} and ${MAX_FILES} entries
- Each entry must have: "subtopic" (non-empty string), "filename" (kebab-case with .md extension, max ${MAX_FILENAME_LENGTH} chars), "description" (non-empty string), "relatedFiles" (array of filenames from this plan)
- Filenames must match the pattern: lowercase letters, numbers, and hyphens only, ending in .md
- Each subtopic should be distinct and cover a different aspect of the topic
- relatedFiles should reference other filenames in the same plan that are conceptually related`,
  };

  const userMessage: CompletionMessage = {
    role: 'user',
    content: `Plan a context set for the following topic:

Topic: ${scope.originalTopic}
Use Case: ${scope.originalUseCase}
Summary: ${scope.summary}
Refinements: ${scope.refinements.length > 0 ? scope.refinements.join(', ') : 'None'}

Return a JSON object with the following structure:
{
  "files": [
    {
      "subtopic": "...",
      "filename": "...",
      "description": "...",
      "relatedFiles": ["..."]
    }
  ]
}`,
  };

  return [systemMessage, userMessage];
}

/**
 * Plans a context set based on the refined topic scope.
 *
 * If a ProviderRegistry is supplied and an active LLM provider is available,
 * attempts to use the LLM to generate the content plan. Falls back to the
 * heuristic implementation on any failure (parse error, validation error,
 * timeout, provider error).
 *
 * When no registry is provided (or no provider is configured), uses the
 * heuristic implementation directly.
 *
 * @param scope - The refined topic scope from the clarification phase
 * @param registry - Optional ProviderRegistry for LLM-based planning
 * @returns A ContentPlan with planned files and estimated total
 */
export async function planContextSet(scope: TopicScope, registry?: ProviderRegistry): Promise<ContentPlan> {
  if (registry) {
    try {
      const provider = registry.getActiveProvider();
      if (provider) {
        const config = registry.getStageConfig('planner');
        const messages = buildContentPlanPrompt(scope);

        const response = await provider.complete({
          messages,
          model: config.model,
          maxTokens: config.maxTokens,
        });

        const result = parseAndValidate<ContentPlan>(
          response.content,
          isValidContentPlan,
          'ContentPlanner'
        );

        if (result.success && result.data) {
          return {
            files: result.data.files,
            estimatedTotal: result.data.files.length,
          };
        }

        // Validation/parse failure — fall back
        console.warn(`[ContentPlanner] Falling back to heuristic: ${result.error}`);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.warn(`[ContentPlanner] Falling back to heuristic: ${reason}`);
    }
  }

  // Heuristic fallback (original implementation)
  return planContextSetHeuristic(scope);
}

/**
 * Heuristic implementation of content planning.
 * This is the original implementation preserved as fallback.
 */
function planContextSetHeuristic(scope: TopicScope): ContentPlan {
  const subtopics = extractSubtopics(scope);
  const files = buildPlannedFiles(subtopics);

  return {
    files,
    estimatedTotal: files.length,
  };
}

/**
 * Extracts distinct subtopics from the topic scope.
 *
 * Uses heuristics based on the summary and refinements:
 * - Parses the summary for distinct concepts (sentence-based splitting)
 * - Uses refinements to add specific subtopics
 * - Ensures each subtopic is distinct (no duplicates)
 * - Clamps the result to MIN_FILES–MAX_FILES range
 */
function extractSubtopics(scope: TopicScope): string[] {
  const candidates: string[] = [];

  // Extract concepts from the summary by splitting on sentence boundaries
  const summaryConcepts = parseSummaryConcepts(scope.summary);
  candidates.push(...summaryConcepts);

  // Add refinements as potential subtopics
  for (const refinement of scope.refinements) {
    const trimmed = refinement.trim();
    if (trimmed.length > 0) {
      candidates.push(trimmed);
    }
  }

  // If we still don't have enough, derive from the original topic
  if (candidates.length < MIN_FILES) {
    const topicConcepts = parseSummaryConcepts(scope.originalTopic);
    for (const concept of topicConcepts) {
      if (!candidates.some((c) => normalizeForComparison(c) === normalizeForComparison(concept))) {
        candidates.push(concept);
      }
    }
  }

  // Deduplicate subtopics (case-insensitive comparison)
  const unique = deduplicateSubtopics(candidates);

  // Clamp to valid range
  if (unique.length < MIN_FILES) {
    // Pad with generic subtopics derived from the topic
    return padSubtopics(unique, scope);
  }

  if (unique.length > MAX_FILES) {
    return unique.slice(0, MAX_FILES);
  }

  return unique;
}

/**
 * Parses a text block into distinct concept phrases.
 * Splits on sentence boundaries and filters out very short fragments.
 */
function parseSummaryConcepts(text: string): string[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Split on sentence-ending punctuation or semicolons
  const sentences = text
    .split(/[.;!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 5);

  // Extract the core concept from each sentence (use first meaningful clause)
  return sentences.map((sentence) => {
    // If the sentence is short enough, use it directly as a subtopic title
    if (sentence.length <= 80) {
      return capitalizeFirst(sentence);
    }
    // Otherwise, take the first clause
    const clause = sentence.split(/[,:]/).map((c) => c.trim()).find((c) => c.length >= 5);
    return capitalizeFirst(clause || sentence.slice(0, 80));
  });
}

/**
 * Removes duplicate subtopics using case-insensitive comparison.
 */
function deduplicateSubtopics(subtopics: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const subtopic of subtopics) {
    const normalized = normalizeForComparison(subtopic);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(subtopic);
    }
  }

  return result;
}

/**
 * Normalizes a string for comparison purposes.
 * Lowercases and removes extra whitespace.
 */
function normalizeForComparison(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Pads the subtopic list to reach MIN_FILES by generating
 * generic subtopics from the topic scope.
 */
function padSubtopics(existing: string[], _scope: TopicScope): string[] {
  const result = [...existing];
  const genericSuffixes = ['Overview', 'Key Concepts', 'Practical Applications', 'Best Practices', 'Common Patterns'];

  for (const candidate of genericSuffixes) {
    if (result.length >= MIN_FILES) break;
    const normalized = normalizeForComparison(candidate);
    if (!result.some((s) => normalizeForComparison(s) === normalized)) {
      result.push(candidate);
    }
  }

  return result;
}

/**
 * Builds PlannedFile objects from subtopics, generating filenames
 * and determining cross-reference relationships.
 */
function buildPlannedFiles(subtopics: string[]): PlannedFile[] {
  const files: PlannedFile[] = [];
  const usedFilenames = new Set<string>();

  // First pass: generate filenames for all subtopics
  for (const subtopic of subtopics) {
    let filename = generateFilename(subtopic);

    // Handle filename collisions by appending a numeric suffix
    filename = resolveFilenameCollision(filename, usedFilenames);
    usedFilenames.add(filename);

    files.push({
      subtopic,
      filename,
      description: `Covers ${subtopic.toLowerCase()} in the context of the topic.`,
      relatedFiles: [],
    });
  }

  // Second pass: determine cross-reference relationships
  assignCrossReferences(files);

  return files;
}

/**
 * Resolves filename collisions by appending a numeric suffix.
 * E.g., if "overview.md" exists, tries "overview-2.md", "overview-3.md", etc.
 */
function resolveFilenameCollision(filename: string, usedFilenames: Set<string>): string {
  if (!usedFilenames.has(filename)) {
    return filename;
  }

  const extension = '.md';
  const base = filename.slice(0, -extension.length);
  let counter = 2;

  while (true) {
    const candidate = `${base}-${counter}${extension}`;
    if (!usedFilenames.has(candidate)) {
      return candidate;
    }
    counter++;
  }
}

/**
 * Assigns cross-reference relationships between files.
 *
 * Strategy: each file references its immediate neighbors and
 * conceptually related files (based on position in the list).
 * This creates a connected graph without overwhelming any single file.
 */
function assignCrossReferences(files: PlannedFile[]): void {
  const fileCount = files.length;

  for (let i = 0; i < fileCount; i++) {
    const current = files[i]!;
    const relatedFiles: string[] = [];

    // Reference the next file (sequential relationship)
    if (i < fileCount - 1) {
      relatedFiles.push(files[i + 1]!.filename);
    }

    // Reference the previous file (sequential relationship)
    if (i > 0) {
      relatedFiles.push(files[i - 1]!.filename);
    }

    // For larger sets, add a cross-link to a non-adjacent file
    if (fileCount > 4) {
      const crossIndex = (i + Math.floor(fileCount / 2)) % fileCount;
      const crossFile = files[crossIndex]!;
      if (crossIndex !== i && !relatedFiles.includes(crossFile.filename)) {
        relatedFiles.push(crossFile.filename);
      }
    }

    current.relatedFiles = relatedFiles;
  }
}

/**
 * Capitalizes the first letter of a string.
 */
function capitalizeFirst(text: string): string {
  if (text.length === 0) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
