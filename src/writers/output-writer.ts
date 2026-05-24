import { mkdir, writeFile as fsWriteFile, rename, unlink, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { GeneratedFile, WriteResult } from '../models/interfaces.js';

/**
 * Writes all generated context files and the index to a dedicated output directory.
 *
 * Creates the output directory if it doesn't exist (recursively), then writes
 * each file's content and the index. Returns a WriteResult for each operation.
 * Partial failures are handled gracefully — successful writes are preserved
 * even if some files fail.
 *
 * @param outputDir - The directory path where files should be written
 * @param files - The generated context files to write
 * @param index - The index.md content string
 * @returns An array of WriteResult objects, one per file plus one for the index
 */
export async function writeContextSet(
  outputDir: string,
  files: GeneratedFile[],
  index: string
): Promise<WriteResult[]> {
  const results: WriteResult[] = [];

  // Create the output directory if it doesn't exist
  try {
    await mkdir(outputDir, { recursive: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // If we can't create the directory, all writes will fail
    const failResult: WriteResult = {
      success: false,
      error: `Failed to create output directory: ${message}`,
    };
    return [failResult];
  }

  // Write each generated file
  for (const file of files) {
    const result = await writeFile(outputDir, file);
    results.push(result);
  }

  // Write the index file
  const indexResult = await writeFileAtomically(outputDir, 'index.md', index);
  results.push(indexResult);

  return results;
}

/**
 * Writes a single generated file atomically to the output directory.
 *
 * Uses a write-to-temp-then-rename strategy to ensure the file is either
 * fully written or not present at all. This prevents partial writes from
 * corrupting the output.
 *
 * @param outputDir - The directory path where the file should be written
 * @param file - The generated file to write
 * @returns A WriteResult indicating success or failure with the file path
 */
export async function writeFile(
  outputDir: string,
  file: GeneratedFile
): Promise<WriteResult> {
  return writeFileAtomically(outputDir, file.filename, file.content);
}

/**
 * Removes a file from the output directory.
 *
 * @param outputDir - The directory path containing the file
 * @param filename - The name of the file to remove
 * @returns A WriteResult indicating success or failure
 */
export async function removeFile(
  outputDir: string,
  filename: string
): Promise<WriteResult> {
  const filePath = join(outputDir, filename);

  try {
    await access(filePath);
    await unlink(filePath);
    return { success: true, path: filePath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to remove file "${filename}": ${message}`,
      path: filePath,
    };
  }
}

/**
 * Writes content to a file atomically using a temp-file-then-rename strategy.
 *
 * This ensures the target file is either fully written or not modified at all,
 * preventing partial writes from corrupting existing content.
 */
async function writeFileAtomically(
  outputDir: string,
  filename: string,
  content: string
): Promise<WriteResult> {
  const targetPath = join(outputDir, filename);
  const tempPath = join(outputDir, `.${filename}.${randomUUID()}.tmp`);

  try {
    // Ensure the output directory exists (handles nested filenames)
    await mkdir(dirname(targetPath), { recursive: true });

    // Write to a temporary file first
    await fsWriteFile(tempPath, content, 'utf-8');

    // Atomically rename temp file to target
    await rename(tempPath, targetPath);

    return { success: true, path: targetPath };
  } catch (error) {
    // Clean up the temp file if it was created
    try {
      await unlink(tempPath);
    } catch {
      // Temp file may not exist if the write itself failed — ignore
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Failed to write file "${filename}": ${message}`,
      path: targetPath,
    };
  }
}
