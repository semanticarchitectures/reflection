import { ValidationResult } from '../models/interfaces';
import {
  MAX_TOPIC_LENGTH,
  MAX_USE_CASE_LENGTH,
  MIN_CONTENT_LENGTH,
} from '../models/types';

/**
 * Counts the number of non-whitespace characters in a string.
 */
function countNonWhitespace(input: string): number {
  return input.replace(/\s/g, '').length;
}

/**
 * Validates a topic description against length and content constraints.
 *
 * Accepts strings with 10–2000 non-whitespace characters.
 * Rejects empty, whitespace-only, too-short, or too-long inputs.
 */
export function validateTopicDescription(input: string): ValidationResult {
  if (input.length > MAX_TOPIC_LENGTH) {
    return {
      valid: false,
      error: `Topic description exceeds maximum length of ${MAX_TOPIC_LENGTH} characters.`,
    };
  }

  const nonWhitespaceCount = countNonWhitespace(input);

  if (nonWhitespaceCount < MIN_CONTENT_LENGTH) {
    return {
      valid: false,
      error:
        'Topic description requires at least 10 characters of content. Please provide more detail.',
    };
  }

  return { valid: true };
}

/**
 * Validates a use case description against length and content constraints.
 *
 * Accepts strings with 10–1000 non-whitespace characters.
 * Rejects empty, whitespace-only, too-short, or too-long inputs.
 */
export function validateUseCaseDescription(input: string): ValidationResult {
  if (input.length > MAX_USE_CASE_LENGTH) {
    return {
      valid: false,
      error: `Use case description exceeds maximum length of ${MAX_USE_CASE_LENGTH} characters.`,
    };
  }

  const nonWhitespaceCount = countNonWhitespace(input);

  if (nonWhitespaceCount < MIN_CONTENT_LENGTH) {
    return {
      valid: false,
      error:
        'Use case description requires at least 10 characters of content. Please provide more detail.',
    };
  }

  return { valid: true };
}
