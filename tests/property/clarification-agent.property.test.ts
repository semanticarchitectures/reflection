/**
 * Property-based tests for the ClarificationAgent.
 * Tests Properties 4–7 from the design document.
 *
 * Feature: context-generation
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { ClarificationAgent } from '../../src/agents/clarification-agent';

/**
 * Generator for valid topic strings:
 * - At least 10 non-whitespace characters
 * - Total length ≤ 2000 characters
 */
const validTopicArb = fc
  .tuple(
    // Generate a base string with at least 10 non-whitespace chars
    fc.stringOf(fc.char().filter((c) => c.trim().length > 0), { minLength: 10, maxLength: 200 }),
    // Optionally add some whitespace padding
    fc.stringOf(fc.constantFrom(' ', '\t', '\n'), { minLength: 0, maxLength: 50 })
  )
  .map(([content, padding]) => {
    const combined = content + padding;
    return combined.slice(0, 2000);
  })
  .filter((s) => {
    const nonWs = s.replace(/\s/g, '').length;
    return nonWs >= 10 && s.length <= 2000;
  });

/**
 * Generator for valid use case strings:
 * - At least 10 non-whitespace characters
 * - Total length ≤ 1000 characters
 */
const validUseCaseArb = fc
  .tuple(
    fc.stringOf(fc.char().filter((c) => c.trim().length > 0), { minLength: 10, maxLength: 150 }),
    fc.stringOf(fc.constantFrom(' ', '\t', '\n'), { minLength: 0, maxLength: 30 })
  )
  .map(([content, padding]) => {
    const combined = content + padding;
    return combined.slice(0, 1000);
  })
  .filter((s) => {
    const nonWs = s.replace(/\s/g, '').length;
    return nonWs >= 10 && s.length <= 1000;
  });

describe('ClarificationAgent Property Tests', () => {
  /**
   * Property 4: Clarification question count bounds
   *
   * For any valid topic and use case input, the ClarificationAgent SHALL
   * generate between 1 and 5 questions inclusive.
   *
   * **Validates: Requirements 2.1**
   */
  describe('Property 4: Clarification question count bounds', () => {
    it('generates between 1 and 5 total questions for any valid input', async () => {
      await fc.assert(
        fc.asyncProperty(validTopicArb, validUseCaseArb, async (topic, useCase) => {
          const agent = new ClarificationAgent(topic, useCase);
          let totalQuestions = 0;

          // Collect all questions across all rounds
          while (!agent.isComplete()) {
            const batch = await agent.generateQuestions();
            if (batch.length === 0) break;
            totalQuestions += batch.length;

            // Submit empty answers to allow progression
            const answers = new Map<string, string>();
            agent.submitAnswers(answers);
          }

          expect(totalQuestions).toBeGreaterThanOrEqual(1);
          expect(totalQuestions).toBeLessThanOrEqual(5);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 5: Clarification question batch size
   *
   * For any set of clarification questions presented to the user,
   * each batch SHALL contain no more than 3 questions.
   *
   * **Validates: Requirements 2.2**
   */
  describe('Property 5: Clarification question batch size', () => {
    it('each batch contains at most 3 questions', async () => {
      await fc.assert(
        fc.asyncProperty(validTopicArb, validUseCaseArb, async (topic, useCase) => {
          const agent = new ClarificationAgent(topic, useCase);

          while (!agent.isComplete()) {
            const batch = await agent.generateQuestions();
            if (batch.length === 0) break;

            expect(batch.length).toBeLessThanOrEqual(3);

            // Submit empty answers to allow progression
            const answers = new Map<string, string>();
            agent.submitAnswers(answers);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 6: Topic scope preserves original input
   *
   * For any clarification session that produces a TopicScope, the resulting
   * scope SHALL contain the original topic description and original use case
   * description unchanged.
   *
   * **Validates: Requirements 2.3**
   */
  describe('Property 6: Topic scope preserves original input', () => {
    it('resulting scope contains original topic and use case unchanged', async () => {
      await fc.assert(
        fc.asyncProperty(validTopicArb, validUseCaseArb, async (topic, useCase) => {
          const agent = new ClarificationAgent(topic, useCase);

          // Run through at least one round of questions
          const questions = await agent.generateQuestions();
          const answers = new Map<string, string>();
          for (const q of questions) {
            answers.set(q.id, 'Some clarification answer');
          }
          agent.submitAnswers(answers);

          const scope = agent.processAnswers();

          expect(scope.originalTopic).toBe(topic);
          expect(scope.originalUseCase).toBe(useCase);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 7: Clarification session terminates
   *
   * For any clarification session, the session SHALL signal completion
   * (isComplete returns true) after at most 3 rounds of questions or when
   * all generated questions have been answered, whichever comes first.
   *
   * **Validates: Requirements 2.4**
   */
  describe('Property 7: Clarification session terminates', () => {
    it('session completes after at most 3 rounds or when all questions answered', async () => {
      await fc.assert(
        fc.asyncProperty(
          validTopicArb,
          validUseCaseArb,
          // Random strategy: answer all, answer none, or answer randomly
          fc.constantFrom('answer-all', 'answer-none', 'answer-random'),
          async (topic, useCase, strategy) => {
            const agent = new ClarificationAgent(topic, useCase);
            let rounds = 0;

            while (!agent.isComplete()) {
              const batch = await agent.generateQuestions();
              if (batch.length === 0) break;
              rounds++;

              const answers = new Map<string, string>();
              if (strategy === 'answer-all') {
                for (const q of batch) {
                  answers.set(q.id, 'A valid answer to the question');
                }
              } else if (strategy === 'answer-random') {
                for (const q of batch) {
                  if (Math.random() > 0.5) {
                    answers.set(q.id, 'A partial answer');
                  }
                }
              }
              // 'answer-none' submits empty map
              agent.submitAnswers(answers);
            }

            // Session must terminate
            expect(agent.isComplete()).toBe(true);
            // Must not exceed 3 rounds
            expect(rounds).toBeLessThanOrEqual(3);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
