/**
 * JSON extraction and validation utilities for LLM responses.
 *
 * Handles the common case where LLM responses wrap JSON content in
 * markdown code fences, leading/trailing text, or other non-JSON content.
 * Provides type-safe parsing with validation and structured error reporting.
 */

/**
 * Result of a JSON parse and validation attempt.
 *
 * On success, `data` contains the validated result.
 * On failure, `error` describes what went wrong and `rawContent`
 * contains the truncated original response for debugging.
 */
export interface ParseResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  rawContent?: string; // truncated to 4000 chars for logging
}

/** Maximum characters to retain in rawContent for logging. */
const MAX_RAW_CONTENT_LENGTH = 4000;

/**
 * Extract the first complete JSON object or array from a response string.
 *
 * Handles:
 * - Raw JSON (no wrapping)
 * - Markdown code fences: ```json ... ``` or ``` ... ```
 * - Leading text before JSON: "Here is the plan:\n{...}"
 * - Trailing text after JSON: "{...}\nLet me know if..."
 * - Combinations of the above
 *
 * @param response - The raw LLM response string
 * @returns The extracted JSON string, or null if no valid JSON structure found
 */
export function extractJSON(response: string): string | null {
  if (!response || response.trim().length === 0) {
    return null;
  }

  // Step 1: Try to extract from markdown code fences first
  const fencePattern = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/;
  const fenceMatch = fencePattern.exec(response);
  if (fenceMatch) {
    const fenceContent = fenceMatch[1]!.trim();
    if (fenceContent.length > 0) {
      // Validate it looks like JSON before returning
      const extracted = findCompleteJSON(fenceContent);
      if (extracted !== null) {
        return extracted;
      }
    }
  }

  // Step 2: Find the first complete JSON object or array in the raw text
  return findCompleteJSON(response);
}

/**
 * Find the first complete JSON object `{...}` or array `[...]` in a string
 * by locating the opening bracket and tracking nesting to find the matching close.
 */
function findCompleteJSON(text: string): string | null {
  // Find the first { or [ that starts a JSON structure
  const startIndex = findJSONStart(text);
  if (startIndex === -1) {
    return null;
  }

  const openChar = text[startIndex]!;
  const closeChar = openChar === '{' ? '}' : ']';

  // Track nesting depth, accounting for strings
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < text.length; i++) {
    const char = text[i]!;

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === openChar) {
      depth++;
    } else if (char === closeChar) {
      depth--;
      if (depth === 0) {
        return text.slice(startIndex, i + 1);
      }
    }
  }

  return null;
}

/**
 * Find the index of the first `{` or `[` that could start a JSON value.
 */
function findJSONStart(text: string): number {
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '{' || char === '[') {
      return i;
    }
  }
  return -1;
}

/**
 * Truncate a string to the maximum raw content length for logging.
 */
function truncateForLogging(content: string): string {
  if (content.length <= MAX_RAW_CONTENT_LENGTH) {
    return content;
  }
  return content.slice(0, MAX_RAW_CONTENT_LENGTH);
}

/**
 * Parse an LLM response as JSON and validate it against a type guard.
 *
 * 1. Calls extractJSON to find the JSON string in the response
 * 2. Parses with JSON.parse
 * 3. Runs the validator type guard
 * 4. Returns ParseResult with appropriate fields
 *
 * On failure, includes truncated raw content (max 4000 chars) for debugging.
 *
 * @param response - The raw LLM response string
 * @param validator - A type guard function that validates the parsed JSON
 * @param stageName - The pipeline stage name for error reporting
 * @returns ParseResult with success/failure, data, error message, and raw content
 */
export function parseAndValidate<T>(
  response: string,
  validator: (parsed: unknown) => parsed is T,
  stageName: string
): ParseResult<T> {
  // Step 1: Extract JSON from the response
  const jsonString = extractJSON(response);
  if (jsonString === null) {
    return {
      success: false,
      error: `[${stageName}] No valid JSON object or array found in response`,
      rawContent: truncateForLogging(response),
    };
  }

  // Step 2: Parse the JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      error: `[${stageName}] JSON parse error: ${message}`,
      rawContent: truncateForLogging(response),
    };
  }

  // Step 3: Validate against the type guard
  if (!validator(parsed)) {
    return {
      success: false,
      error: `[${stageName}] Schema validation failed: parsed JSON does not match expected structure`,
      rawContent: truncateForLogging(response),
    };
  }

  // Success
  return {
    success: true,
    data: parsed,
  };
}
