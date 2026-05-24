/**
 * ProgressReporter module.
 * Reports generation progress to the user via callbacks or console output.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */

import { GeneratedFile } from '../models/interfaces.js';

/** Callback signature for progress messages. */
export type ProgressCallback = (message: string) => void;

/** Default callback that writes to stdout. */
const defaultCallback: ProgressCallback = (message: string) => {
  process.stdout.write(message + '\n');
};

/**
 * Reports progress during context file generation.
 * Accepts an optional callback for custom output handling (useful for testing).
 * Defaults to stdout output if no callback is provided.
 */
export class ProgressReporter {
  private callback: ProgressCallback;
  private errors: Array<{ filename: string; error: string }> = [];

  constructor(callback?: ProgressCallback) {
    this.callback = callback ?? defaultCallback;
  }

  /**
   * Report that generation has started with the estimated total number of files.
   * Requirement 5.1: Inform the user that generation has started and display the estimated total.
   */
  onStart(estimatedTotal: number): void {
    this.errors = [];
    this.callback(
      `Context generation started. Estimated files to generate: ${estimatedTotal}`
    );
  }

  /**
   * Report progress after a file is completed.
   * Requirement 5.2: Report the name of the completed file and the count of completed/total.
   */
  onFileComplete(filename: string, completed: number, total: number): void {
    this.callback(
      `Generated: ${filename} (${completed}/${total})`
    );
  }

  /**
   * Report an error for a file that failed to generate.
   * Requirement 5.4: Report the failure, identify the file, and continue.
   */
  onFileError(filename: string, error: string): void {
    this.errors.push({ filename, error });
    this.callback(
      `Error generating ${filename}: ${error}`
    );
  }

  /**
   * Present a summary of all generated files.
   * Requirement 5.3: List all generated files by filename and subtopic.
   */
  onComplete(files: GeneratedFile[]): void {
    const lines: string[] = [
      `Context generation complete. ${files.length} file(s) generated.`,
    ];

    if (files.length > 0) {
      lines.push('Generated files:');
      for (const file of files) {
        lines.push(`  - ${file.filename}: ${file.title}`);
      }
    }

    if (this.errors.length > 0) {
      lines.push(`Errors encountered: ${this.errors.length}`);
      for (const err of this.errors) {
        lines.push(`  - ${err.filename}: ${err.error}`);
      }
    }

    this.callback(lines.join('\n'));
  }
}
