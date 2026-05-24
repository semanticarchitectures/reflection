import { MAX_FILENAME_LENGTH } from '../models/types.js';

/**
 * Generates a valid kebab-case filename from a subtopic title.
 *
 * Rules:
 * - Converts to lowercase
 * - Replaces spaces and special characters with hyphens
 * - Removes consecutive hyphens
 * - Removes leading/trailing hyphens
 * - Truncates to fit within MAX_FILENAME_LENGTH (60) including .md extension
 * - Output matches pattern: [a-z0-9]+(-[a-z0-9]+)*\.md
 *
 * @param title - The subtopic title to convert
 * @returns A valid filename ending in .md, or 'untitled.md' for edge cases
 */
export function generateFilename(title: string): string {
  const extension = '.md';
  const maxBaseLength = MAX_FILENAME_LENGTH - extension.length;

  // Convert to lowercase
  let base = title.toLowerCase();

  // Normalize unicode characters to ASCII equivalents where possible
  base = base.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

  // Replace any character that isn't a-z or 0-9 with a hyphen
  base = base.replace(/[^a-z0-9]/g, '-');

  // Remove consecutive hyphens
  base = base.replace(/-+/g, '-');

  // Remove leading and trailing hyphens
  base = base.replace(/^-+|-+$/g, '');

  // Handle edge case: empty string after stripping
  if (base.length === 0) {
    return `untitled${extension}`;
  }

  // Truncate to fit within max length, avoiding trailing hyphens after truncation
  if (base.length > maxBaseLength) {
    base = base.slice(0, maxBaseLength);
    // Remove any trailing hyphens created by truncation
    base = base.replace(/-+$/, '');
  }

  // Final safety check: if truncation removed everything
  if (base.length === 0) {
    return `untitled${extension}`;
  }

  return `${base}${extension}`;
}
