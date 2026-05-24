import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  validateTopicDescription,
  validateUseCaseDescription,
} from '../../src/validators/input-validator';
import {
  MAX_TOPIC_LENGTH,
  MAX_USE_CASE_LENGTH,
  MIN_CONTENT_LENGTH,
} from '../../src/models/types';

/**
 * Property-based tests for input validation (Properties 1–3).
 *
 * Validates: Requirements 1.1, 1.2, 1.4, 1.5, 1.6
 */

/**
 * Generator: produces a string with exactly `count` non-whitespace characters,
 * optionally interspersed with whitespace.
 */
function stringWithNonWhitespaceCount(
  minNonWs: number,
  maxNonWs: number,
  maxTotalLength: number
): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.integer({ min: minNonWs, max: maxNonWs }),
      fc.array(
        fc.oneof(
          fc.char().filter((c) => /\S/.test(c)),
          fc.constantFrom(' ', '\t', '\n', '\r')
        ),
        { minLength: 1, maxLength: maxTotalLength }
      )
    )
    .map(([targetNonWs, chars]) => {
      // Build a string with exactly targetNonWs non-whitespace chars
      const nonWsChars = chars.filter((c) => /\S/.test(c));
      const wsChars = chars.filter((c) => /\s/.test(c));

      // Take exactly targetNonWs non-whitespace chars (pad if needed)
      const selectedNonWs: string[] = [];
      for (let i = 0; i < targetNonWs; i++) {
        selectedNonWs.push(nonWsChars[i % Math.max(nonWsChars.length, 1)] || 'a');
      }

      // Intersperse with some whitespace
      const result: string[] = [];
      let wsIdx = 0;
      for (const ch of selectedNonWs) {
        // Optionally add whitespace before each non-ws char
        if (wsIdx < wsChars.length && Math.random() > 0.5) {
          result.push(wsChars[wsIdx]!);
          wsIdx++;
        }
        result.push(ch);
      }
      // Append remaining whitespace
      while (wsIdx < wsChars.length) {
        result.push(wsChars[wsIdx]!);
        wsIdx++;
      }

      return result.join('').slice(0, maxTotalLength);
    })
    .filter((s) => {
      const nonWsCount = s.replace(/\s/g, '').length;
      return nonWsCount >= minNonWs && s.length <= maxTotalLength;
    });
}

/**
 * Generator: produces a string with fewer than MIN_CONTENT_LENGTH non-whitespace chars.
 * Includes empty strings, whitespace-only strings, and strings with 1-9 non-ws chars.
 */
function insufficientContentString(maxTotalLength: number): fc.Arbitrary<string> {
  return fc.oneof(
    // Empty string
    fc.constant(''),
    // Whitespace-only strings
    fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 1, maxLength: 50 }),
    // Strings with 1 to MIN_CONTENT_LENGTH-1 non-whitespace chars mixed with whitespace
    fc
      .integer({ min: 1, max: MIN_CONTENT_LENGTH - 1 })
      .chain((nonWsCount) =>
        fc
          .tuple(
            fc.array(fc.char().filter((c) => /\S/.test(c)), {
              minLength: nonWsCount,
              maxLength: nonWsCount,
            }),
            fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), {
              minLength: 0,
              maxLength: 20,
            })
          )
          .map(([nonWsChars, wsChars]) => {
            // Interleave non-ws and ws chars
            const result: string[] = [];
            let wsIdx = 0;
            for (const ch of nonWsChars) {
              if (wsIdx < wsChars.length) {
                result.push(wsChars[wsIdx]!);
                wsIdx++;
              }
              result.push(ch);
            }
            while (wsIdx < wsChars.length) {
              result.push(wsChars[wsIdx]!);
              wsIdx++;
            }
            return result.join('').slice(0, maxTotalLength);
          })
      )
  );
}

/**
 * Generator: produces a string that exceeds the given max length.
 */
function exceedsMaxLengthString(maxLength: number): fc.Arbitrary<string> {
  return fc
    .integer({ min: maxLength + 1, max: maxLength + 500 })
    .chain((len) =>
      fc.stringOf(fc.oneof(fc.char().filter((c) => /\S/.test(c)), fc.constantFrom(' ')), {
        minLength: len,
        maxLength: len,
      })
    );
}

describe('Input Validation Property Tests', () => {
  describe('Property 1: Valid input acceptance', () => {
    /**
     * **Validates: Requirements 1.1, 1.2**
     *
     * For any string with ≥10 non-whitespace chars and ≤ max length,
     * validator accepts.
     */
    it('validateTopicDescription accepts any string with ≥10 non-whitespace chars and ≤ max length', () => {
      fc.assert(
        fc.property(
          stringWithNonWhitespaceCount(MIN_CONTENT_LENGTH, 200, MAX_TOPIC_LENGTH),
          (input) => {
            const result = validateTopicDescription(input);
            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('validateUseCaseDescription accepts any string with ≥10 non-whitespace chars and ≤ max length', () => {
      fc.assert(
        fc.property(
          stringWithNonWhitespaceCount(MIN_CONTENT_LENGTH, 200, MAX_USE_CASE_LENGTH),
          (input) => {
            const result = validateUseCaseDescription(input);
            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 2: Invalid input rejection — insufficient content', () => {
    /**
     * **Validates: Requirements 1.4, 1.5**
     *
     * For any string that is empty, whitespace-only, or <10 non-whitespace chars,
     * validator rejects.
     */
    it('validateTopicDescription rejects any string with <10 non-whitespace chars', () => {
      fc.assert(
        fc.property(insufficientContentString(MAX_TOPIC_LENGTH), (input) => {
          const result = validateTopicDescription(input);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error).toContain('at least 10 characters');
        }),
        { numRuns: 100 }
      );
    });

    it('validateUseCaseDescription rejects any string with <10 non-whitespace chars', () => {
      fc.assert(
        fc.property(insufficientContentString(MAX_USE_CASE_LENGTH), (input) => {
          const result = validateUseCaseDescription(input);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error).toContain('at least 10 characters');
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 3: Invalid input rejection — exceeds maximum length', () => {
    /**
     * **Validates: Requirements 1.6**
     *
     * For any string exceeding max length, validator rejects with length error.
     */
    it('validateTopicDescription rejects any string exceeding max length', () => {
      fc.assert(
        fc.property(exceedsMaxLengthString(MAX_TOPIC_LENGTH), (input) => {
          const result = validateTopicDescription(input);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error).toContain(`${MAX_TOPIC_LENGTH}`);
        }),
        { numRuns: 100 }
      );
    });

    it('validateUseCaseDescription rejects any string exceeding max length', () => {
      fc.assert(
        fc.property(exceedsMaxLengthString(MAX_USE_CASE_LENGTH), (input) => {
          const result = validateUseCaseDescription(input);
          expect(result.valid).toBe(false);
          expect(result.error).toBeDefined();
          expect(result.error).toContain(`${MAX_USE_CASE_LENGTH}`);
        }),
        { numRuns: 100 }
      );
    });
  });
});
