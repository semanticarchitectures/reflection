import { describe, it, expect } from 'vitest';
import { ClarificationAgent } from '../../src/agents/clarification-agent';

describe('ClarificationAgent', () => {
  describe('generateQuestions', () => {
    it('generates 1–5 questions for a broad topic', async () => {
      const agent = new ClarificationAgent('JavaScript', 'learning');
      const questions = await agent.generateQuestions();

      expect(questions.length).toBeGreaterThanOrEqual(1);
      expect(questions.length).toBeLessThanOrEqual(3); // batch limit
    });

    it('generates questions with id, text, and purpose fields', async () => {
      const agent = new ClarificationAgent('Machine learning', 'build a classifier');
      const questions = await agent.generateQuestions();

      for (const q of questions) {
        expect(q.id).toBeDefined();
        expect(q.id.length).toBeGreaterThan(0);
        expect(q.text).toBeDefined();
        expect(q.text.length).toBeGreaterThan(0);
        expect(q.purpose).toBeDefined();
        expect(q.purpose.length).toBeGreaterThan(0);
      }
    });

    it('returns at most 3 questions per batch', async () => {
      const agent = new ClarificationAgent('AI', 'stuff');
      const batch = await agent.generateQuestions();

      expect(batch.length).toBeLessThanOrEqual(3);
    });

    it('generates no more than 5 total questions across all rounds', async () => {
      const agent = new ClarificationAgent('AI', 'stuff');
      let totalQuestions = 0;

      for (let i = 0; i < 5; i++) {
        const batch = await agent.generateQuestions();
        totalQuestions += batch.length;
        if (agent.isComplete()) break;
        // Submit empty answers to allow next round
        const answers = new Map<string, string>();
        agent.submitAnswers(answers);
      }

      expect(totalQuestions).toBeLessThanOrEqual(5);
      expect(totalQuestions).toBeGreaterThanOrEqual(1);
    });

    it('returns empty array when session is complete', async () => {
      const agent = new ClarificationAgent('AI', 'stuff');

      // Exhaust rounds
      for (let i = 0; i < 3; i++) {
        await agent.generateQuestions();
      }

      expect(agent.isComplete()).toBe(true);
      expect(await agent.generateQuestions()).toEqual([]);
    });

    it('asks about scope when topic is short/broad', async () => {
      const agent = new ClarificationAgent('Python', 'coding');
      const questions = await agent.generateQuestions();

      const scopeQuestion = questions.find((q) => q.id === 'q-scope-1');
      expect(scopeQuestion).toBeDefined();
    });

    it('asks about audience when use case lacks audience info', async () => {
      const agent = new ClarificationAgent(
        'Distributed systems design patterns',
        'generate documentation for the topic'
      );
      const questions = await agent.generateQuestions();

      const allQuestions = [...questions];
      // Get remaining questions if any
      if (!agent.isComplete()) {
        const answers = new Map<string, string>();
        agent.submitAnswers(answers);
        allQuestions.push(...await agent.generateQuestions());
      }

      const audienceQuestion = allQuestions.find((q) => q.id === 'q-audience-1');
      expect(audienceQuestion).toBeDefined();
    });

    it('does not ask about audience when use case mentions a model type', async () => {
      const agent = new ClarificationAgent(
        'Kubernetes',
        'provide context for a coding assistant to help with deployments'
      );
      const questions = await agent.generateQuestions();

      const audienceQuestion = questions.find((q) => q.id === 'q-audience-1');
      expect(audienceQuestion).toBeUndefined();
    });
  });

  describe('submitAnswers', () => {
    it('stores non-empty answers', async () => {
      const agent = new ClarificationAgent('React', 'building apps');
      await agent.generateQuestions();

      const answers = new Map<string, string>();
      answers.set('q-scope-1', 'Focus on hooks and state management');
      agent.submitAnswers(answers);

      const received = agent.getAnswersReceived();
      expect(received.get('q-scope-1')).toBe('Focus on hooks and state management');
    });

    it('ignores empty or whitespace-only answers', async () => {
      const agent = new ClarificationAgent('React', 'building apps');
      await agent.generateQuestions();

      const answers = new Map<string, string>();
      answers.set('q-scope-1', '   ');
      answers.set('q-audience-1', '');
      agent.submitAnswers(answers);

      const received = agent.getAnswersReceived();
      expect(received.size).toBe(0);
    });
  });

  describe('processAnswers', () => {
    it('preserves original topic and use case in TopicScope', async () => {
      const topic = 'TypeScript generics';
      const useCase = 'help a developer understand advanced type patterns';
      const agent = new ClarificationAgent(topic, useCase);

      await agent.generateQuestions();
      const answers = new Map<string, string>();
      answers.set('q-scope-1', 'Focus on conditional types and mapped types');
      agent.submitAnswers(answers);

      const scope = agent.processAnswers();

      expect(scope.originalTopic).toBe(topic);
      expect(scope.originalUseCase).toBe(useCase);
    });

    it('includes refinements from answered questions', async () => {
      const agent = new ClarificationAgent('Docker', 'learning containers');
      await agent.generateQuestions();

      const answers = new Map<string, string>();
      answers.set('q-scope-1', 'Networking and volumes');
      agent.submitAnswers(answers);

      const scope = agent.processAnswers();

      expect(scope.refinements.length).toBeGreaterThan(0);
      expect(scope.refinements[0]).toContain('Networking and volumes');
    });

    it('produces empty refinements when no answers given', async () => {
      const agent = new ClarificationAgent('Docker', 'learning containers');
      await agent.generateQuestions();
      agent.submitAnswers(new Map());

      const scope = agent.processAnswers();

      expect(scope.refinements).toEqual([]);
    });

    it('builds a summary combining topic, use case, and refinements', async () => {
      const agent = new ClarificationAgent('GraphQL', 'API development for a backend engineer');
      await agent.generateQuestions();

      const answers = new Map<string, string>();
      answers.set('q-scope-1', 'Schema design and resolvers');
      agent.submitAnswers(answers);

      const scope = agent.processAnswers();

      expect(scope.summary).toContain('GraphQL');
      expect(scope.summary).toContain('API development');
    });
  });

  describe('isComplete', () => {
    it('returns false initially', () => {
      const agent = new ClarificationAgent('Rust', 'systems programming');
      expect(agent.isComplete()).toBe(false);
    });

    it('returns true after 3 rounds', async () => {
      const agent = new ClarificationAgent('AI', 'general');

      await agent.generateQuestions();
      await agent.generateQuestions();
      await agent.generateQuestions();

      expect(agent.isComplete()).toBe(true);
    });

    it('returns true when all questions are answered and pool exhausted', async () => {
      // Use a specific topic that triggers few questions
      const agent = new ClarificationAgent(
        'A comprehensive deep-dive into modern React hooks patterns for state management in 2024',
        'provide detailed context for an expert developer building a complex dashboard application'
      );

      const questions = await agent.generateQuestions();
      const answers = new Map<string, string>();
      for (const q of questions) {
        answers.set(q.id, 'Some answer');
      }
      agent.submitAnswers(answers);

      // If pool is exhausted and all answered, should be complete
      // (may need additional rounds depending on heuristics)
      // Get remaining questions
      let remaining = await agent.generateQuestions();
      while (remaining.length > 0) {
        for (const q of remaining) {
          answers.set(q.id, 'Another answer');
        }
        agent.submitAnswers(answers);
        if (agent.isComplete()) break;
        remaining = await agent.generateQuestions();
      }

      expect(agent.isComplete()).toBe(true);
    });

    it('returns true when max total questions reached', async () => {
      const agent = new ClarificationAgent('X', 'Y');

      // Generate questions until we hit the limit
      let total = 0;
      for (let i = 0; i < 5; i++) {
        const batch = await agent.generateQuestions();
        total += batch.length;
        if (agent.isComplete()) break;
      }

      expect(agent.isComplete()).toBe(true);
      expect(total).toBeLessThanOrEqual(5);
    });
  });

  describe('session state tracking', () => {
    it('tracks round count correctly', async () => {
      const agent = new ClarificationAgent('Go', 'microservices');

      expect(agent.getRound()).toBe(0);
      await agent.generateQuestions();
      expect(agent.getRound()).toBe(1);
      await agent.generateQuestions();
      expect(agent.getRound()).toBe(2);
    });

    it('tracks all questions asked', async () => {
      const agent = new ClarificationAgent('Elixir', 'web apps');

      const batch1 = await agent.generateQuestions();
      const batch2 = await agent.generateQuestions();

      const allAsked = agent.getQuestionsAsked();
      expect(allAsked.length).toBe(batch1.length + batch2.length);
    });
  });
});
