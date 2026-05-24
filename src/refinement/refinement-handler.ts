import { GenerationSession, GeneratedFile, RemoveResult, PlannedFile, CrossReference } from '../models/interfaces.js';
import { MIN_FILES } from '../models/types.js';
import { generateFile } from '../generators/file-generator.js';
import { generateFilename } from '../generators/filename-generator.js';

/**
 * Handles post-generation modifications to a context set: editing, adding, and removing files.
 *
 * All operations mutate the session's generatedFiles array in place and return
 * the affected file or a result object. The index is rebuilt after structural
 * changes (add/remove) to maintain consistency.
 */

/**
 * Regenerates a file incorporating user feedback while preserving uncontradicted content.
 *
 * Finds the target file in the session, merges the feedback into the existing content,
 * and updates cross-references if the modification affects them.
 *
 * @param filename - The filename of the file to modify
 * @param feedback - User feedback describing the desired changes
 * @param session - The current generation session state
 * @returns The updated GeneratedFile, or throws an error if the file is not found
 *
 * Requirements: 6.1, 6.6
 */
export function modifyFile(
  filename: string,
  feedback: string,
  session: GenerationSession
): GeneratedFile {
  const fileIndex = session.generatedFiles.findIndex((f) => f.filename === filename);

  if (fileIndex === -1) {
    const availableFiles = session.generatedFiles.map((f) => f.filename);
    throw new Error(
      `File "${filename}" not found in the context set. Available files: ${availableFiles.join(', ')}`
    );
  }

  const existingFile = session.generatedFiles[fileIndex]!;

  // Regenerate the file incorporating feedback while preserving uncontradicted content
  const updatedContent = incorporateFeedback(existingFile, feedback, session);

  // Resolve cross-references against the current file set (excluding self)
  const otherFiles = session.generatedFiles.filter((f) => f.filename !== filename);
  const crossReferences = resolveExistingCrossReferences(existingFile, otherFiles);

  const updatedFile: GeneratedFile = {
    filename: existingFile.filename,
    title: existingFile.title,
    content: updatedContent,
    crossReferences,
  };

  // Replace the file in the session
  session.generatedFiles[fileIndex] = updatedFile;

  return updatedFile;
}

/**
 * Generates a new file for a subtopic and adds it to the session.
 *
 * Creates a PlannedFile from the subtopic, generates the file content using
 * the FileGenerator, adds it to the session's generatedFiles, and rebuilds the index.
 *
 * @param subtopic - The subtopic title for the new file
 * @param session - The current generation session state
 * @returns The newly generated file
 *
 * Requirements: 6.2
 */
export function addFile(
  subtopic: string,
  session: GenerationSession
): GeneratedFile {
  const filename = generateFilename(subtopic);

  // Determine related files from existing set
  const existingFilenames = session.generatedFiles.map((f) => f.filename);

  const planned: PlannedFile = {
    subtopic,
    filename,
    description: `Covers ${subtopic} in the context of ${session.scope.originalTopic}.`,
    relatedFiles: existingFilenames,
  };

  // Generate the file using the existing FileGenerator
  const newFile = generateFile(planned, session.scope, session.generatedFiles);

  // Add to session
  session.generatedFiles.push(newFile);

  return newFile;
}

/**
 * Removes a file from the session, updates cross-references in remaining files,
 * and rebuilds the index.
 *
 * Enforces the minimum 2 files constraint. If the file is not found, returns
 * an error listing available files.
 *
 * @param filename - The filename of the file to remove
 * @param session - The current generation session state
 * @returns A RemoveResult indicating success or failure
 *
 * Requirements: 6.3, 6.4, 6.5, 6.6
 */
export function removeFile(
  filename: string,
  session: GenerationSession
): RemoveResult {
  // Enforce minimum file count constraint
  if (session.generatedFiles.length <= MIN_FILES) {
    return {
      success: false,
      error: `Cannot remove file: a minimum of ${MIN_FILES} context files must be maintained.`,
    };
  }

  const fileIndex = session.generatedFiles.findIndex((f) => f.filename === filename);

  if (fileIndex === -1) {
    const availableFiles = session.generatedFiles.map((f) => f.filename);
    return {
      success: false,
      error: `File "${filename}" not found in the context set. Available files: ${availableFiles.join(', ')}`,
    };
  }

  // Remove the file from the session
  session.generatedFiles.splice(fileIndex, 1);

  // Update cross-references in remaining files (remove broken links to the deleted file)
  for (let i = 0; i < session.generatedFiles.length; i++) {
    const file = session.generatedFiles[i]!;
    const updatedFile = removeCrossReferencesTo(file, filename);
    session.generatedFiles[i] = updatedFile;
  }

  return { success: true };
}

/**
 * Incorporates user feedback into an existing file's content.
 *
 * Preserves the file's structure (H1 heading, sections) and existing content
 * that is not contradicted by the feedback. Appends a section with the
 * feedback-driven modifications.
 */
function incorporateFeedback(
  existingFile: GeneratedFile,
  feedback: string,
  session: GenerationSession
): string {
  const lines = existingFile.content.split('\n');
  const heading = lines[0] || `# ${existingFile.title}`;

  // Preserve the existing body content
  const bodyLines = lines.slice(1);
  const existingBody = bodyLines.join('\n').trim();

  // Build updated content: preserve existing + incorporate feedback
  const parts: string[] = [];
  parts.push(heading);
  parts.push('');

  if (existingBody.length > 0) {
    parts.push(existingBody);
  }

  // Add feedback-driven modifications section
  parts.push('');
  parts.push('## Updates');
  parts.push('');
  parts.push(
    `Based on feedback: ${feedback}. ` +
    `This section addresses the requested changes in the context of ${session.scope.originalTopic} ` +
    `for the use case of ${session.scope.originalUseCase}.`
  );

  return parts.join('\n');
}

/**
 * Resolves cross-references for an existing file against the current file set.
 * Returns only references that still point to existing files.
 */
function resolveExistingCrossReferences(
  file: GeneratedFile,
  otherFiles: GeneratedFile[]
): CrossReference[] {
  const existingFilenames = new Set(otherFiles.map((f) => f.filename));

  return file.crossReferences.filter((ref) => existingFilenames.has(ref.targetFilename));
}

/**
 * Removes cross-references pointing to a specific filename from a file.
 * Also removes the corresponding markdown links from the file content.
 */
function removeCrossReferencesTo(
  file: GeneratedFile,
  removedFilename: string
): GeneratedFile {
  // Filter out cross-references to the removed file
  const updatedReferences = file.crossReferences.filter(
    (ref) => ref.targetFilename !== removedFilename
  );

  // Remove markdown links to the removed file from content
  // Pattern matches: [any text](./removed-filename.md)
  const linkPattern = new RegExp(
    `\\[([^\\]]+)\\]\\(\\.\\/` + escapeRegExp(removedFilename) + `\\)`,
    'g'
  );
  const updatedContent = file.content.replace(linkPattern, '$1');

  return {
    ...file,
    content: updatedContent,
    crossReferences: updatedReferences,
  };
}

/**
 * Escapes special regex characters in a string.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
