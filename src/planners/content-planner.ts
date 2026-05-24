import { TopicScope, ContentPlan, PlannedFile } from '../models/interfaces.js';
import { MIN_FILES, MAX_FILES } from '../models/types.js';
import { generateFilename } from '../generators/filename-generator.js';

/**
 * Determines the structure of a context set — how many files, what subtopics,
 * and how they cross-reference each other.
 */

/**
 * Plans a context set based on the refined topic scope.
 *
 * Analyzes the TopicScope to determine:
 * - How many files to generate (2–10 based on topic complexity)
 * - What subtopics to cover
 * - How files relate to each other (cross-references)
 *
 * @param scope - The refined topic scope from the clarification phase
 * @returns A ContentPlan with planned files and estimated total
 */
export function planContextSet(scope: TopicScope): ContentPlan {
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
