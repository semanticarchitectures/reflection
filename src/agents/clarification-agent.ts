/**
 * ClarificationAgent module.
 *
 * Analyzes a topic and use case to generate targeted clarification questions,
 * processes user answers, and produces a refined TopicScope.
 */

import { ClarificationQuestion, TopicScope } from '../models/interfaces';

/** Heuristic indicators that a topic is broad or underspecified. */
interface BroadnessIndicator {
  condition: (topic: string, useCase: string) => boolean;
  question: (topic: string, useCase: string) => ClarificationQuestion;
}

const MAX_ROUNDS = 3;
const MAX_QUESTIONS_PER_BATCH = 3;
const MAX_TOTAL_QUESTIONS = 5;

/**
 * ClarificationAgent maintains session state and drives the clarification loop.
 *
 * Usage:
 *   const agent = new ClarificationAgent(topic, useCase);
 *   while (!agent.isComplete()) {
 *     const questions = agent.generateQuestions();
 *     const answers = await getUserAnswers(questions);
 *     agent.submitAnswers(answers);
 *   }
 *   const scope = agent.processAnswers();
 */
export class ClarificationAgent {
  private readonly topic: string;
  private readonly useCase: string;
  private currentRound: number = 0;
  private questionsAsked: ClarificationQuestion[] = [];
  private answersReceived: Map<string, string> = new Map();
  private allQuestionsGenerated: ClarificationQuestion[] = [];
  private questionPool: ClarificationQuestion[] = [];
  private poolInitialized: boolean = false;

  constructor(topic: string, useCase: string) {
    this.topic = topic;
    this.useCase = useCase;
  }

  /**
   * Generate the next batch of clarification questions (up to 3).
   * Analyzes the topic and use case to produce questions targeting
   * broad or underspecified areas.
   *
   * Returns 1–3 questions per call, up to 5 total across all rounds.
   */
  generateQuestions(): ClarificationQuestion[] {
    if (this.isComplete()) {
      return [];
    }

    if (!this.poolInitialized) {
      this.questionPool = this.buildQuestionPool();
      this.poolInitialized = true;
    }

    // Determine how many questions we can still ask
    const remainingCapacity = MAX_TOTAL_QUESTIONS - this.questionsAsked.length;
    if (remainingCapacity <= 0) {
      return [];
    }

    // Take the next batch from the pool (up to batch size, up to remaining capacity)
    const batchSize = Math.min(
      MAX_QUESTIONS_PER_BATCH,
      remainingCapacity,
      this.questionPool.length
    );

    if (batchSize === 0) {
      return [];
    }

    const batch = this.questionPool.splice(0, batchSize);
    this.questionsAsked.push(...batch);
    this.allQuestionsGenerated.push(...batch);
    this.currentRound++;

    return batch;
  }

  /**
   * Submit answers for the most recent batch of questions.
   * Empty or whitespace-only answers are treated as unanswered.
   */
  submitAnswers(answers: Map<string, string>): void {
    for (const [questionId, answer] of answers) {
      const trimmed = answer.trim();
      if (trimmed.length > 0) {
        this.answersReceived.set(questionId, trimmed);
      }
    }
  }

  /**
   * Combine original input with all received answers to produce a TopicScope.
   */
  processAnswers(): TopicScope {
    const refinements: string[] = [];

    for (const question of this.allQuestionsGenerated) {
      const answer = this.answersReceived.get(question.id);
      if (answer) {
        refinements.push(`${question.purpose}: ${answer}`);
      }
    }

    const summary = this.buildSummary(refinements);

    return {
      originalTopic: this.topic,
      originalUseCase: this.useCase,
      refinements,
      summary,
    };
  }

  /**
   * Returns true when the clarification session is complete.
   * Complete means: 3 rounds have passed, OR all generated questions
   * have been answered, OR no more questions can be generated.
   */
  isComplete(): boolean {
    // Complete after max rounds
    if (this.currentRound >= MAX_ROUNDS) {
      return true;
    }

    // Complete if we've asked the maximum total questions
    if (this.questionsAsked.length >= MAX_TOTAL_QUESTIONS) {
      return true;
    }

    // Complete if pool is initialized and exhausted, and all asked questions are answered
    if (this.poolInitialized && this.questionPool.length === 0) {
      const allAnswered = this.questionsAsked.every(
        (q) => this.answersReceived.has(q.id)
      );
      if (allAnswered) {
        return true;
      }
    }

    return false;
  }

  /** Get the current round number (1-indexed after first generateQuestions call). */
  getRound(): number {
    return this.currentRound;
  }

  /** Get all questions asked so far. */
  getQuestionsAsked(): ClarificationQuestion[] {
    return [...this.questionsAsked];
  }

  /** Get all answers received so far. */
  getAnswersReceived(): Map<string, string> {
    return new Map(this.answersReceived);
  }

  /**
   * Build the full pool of potential questions based on heuristic analysis
   * of the topic and use case.
   */
  private buildQuestionPool(): ClarificationQuestion[] {
    const questions: ClarificationQuestion[] = [];
    const indicators = this.getIndicators();

    for (const indicator of indicators) {
      if (questions.length >= MAX_TOTAL_QUESTIONS) {
        break;
      }
      if (indicator.condition(this.topic, this.useCase)) {
        questions.push(indicator.question(this.topic, this.useCase));
      }
    }

    // Ensure at least 1 question is generated for any valid input
    if (questions.length === 0) {
      questions.push({
        id: 'q-default-1',
        text: `What specific aspects of "${this.topic}" are most important for your use case?`,
        purpose: 'Identify priority areas within the topic',
      });
    }

    return questions;
  }

  /**
   * Heuristic indicators that detect broad or underspecified inputs.
   * Each indicator has a condition and produces a targeted question.
   */
  private getIndicators(): BroadnessIndicator[] {
    return [
      {
        // Short topic (fewer than 5 words) suggests broadness
        condition: (topic: string) => this.wordCount(topic) < 5,
        question: (_topic: string) => ({
          id: 'q-scope-1',
          text: `The topic "${_topic}" is quite broad. What specific aspects or subtopics would you like covered?`,
          purpose: 'Narrow the scope of a broad topic',
        }),
      },
      {
        // Use case lacks mention of audience/model type
        condition: (_topic: string, useCase: string) =>
          !this.mentionsAudience(useCase),
        question: () => ({
          id: 'q-audience-1',
          text: 'What type of model or audience will consume this context? (e.g., coding assistant, research summarizer, domain expert)',
          purpose: 'Identify the target audience or model type',
        }),
      },
      {
        // Topic doesn't specify a depth level
        condition: (topic: string, useCase: string) =>
          !this.mentionsDepth(topic) && !this.mentionsDepth(useCase),
        question: () => ({
          id: 'q-depth-1',
          text: 'What level of depth do you need? (e.g., introductory overview, intermediate explanation, expert-level detail)',
          purpose: 'Determine the appropriate depth of coverage',
        }),
      },
      {
        // Use case is short/vague (fewer than 8 words)
        condition: (_topic: string, useCase: string) =>
          this.wordCount(useCase) < 8,
        question: () => ({
          id: 'q-usecase-1',
          text: 'Could you elaborate on how the generated context will be used? What tasks or decisions will it support?',
          purpose: 'Clarify the intended application of the context',
        }),
      },
      {
        // Topic doesn't mention temporal scope
        condition: (topic: string, useCase: string) =>
          !this.mentionsTimeframe(topic) && !this.mentionsTimeframe(useCase),
        question: (_topic: string) => ({
          id: 'q-timeframe-1',
          text: `Should the context focus on current state, historical background, or future trends related to "${_topic}"?`,
          purpose: 'Establish the temporal scope of coverage',
        }),
      },
    ];
  }

  /** Count words in a string. */
  private wordCount(text: string): number {
    return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
  }

  /** Check if text mentions an audience or model type. */
  private mentionsAudience(text: string): boolean {
    const audienceTerms = [
      'model', 'assistant', 'agent', 'audience', 'reader',
      'developer', 'engineer', 'researcher', 'student', 'expert',
      'beginner', 'user', 'consumer',
    ];
    const lower = text.toLowerCase();
    return audienceTerms.some((term) => lower.includes(term));
  }

  /** Check if text mentions depth/level. */
  private mentionsDepth(text: string): boolean {
    const depthTerms = [
      'introductory', 'overview', 'deep', 'detailed', 'advanced',
      'beginner', 'intermediate', 'expert', 'comprehensive', 'brief',
      'in-depth', 'thorough', 'surface',
    ];
    const lower = text.toLowerCase();
    return depthTerms.some((term) => lower.includes(term));
  }

  /** Check if text mentions a timeframe or temporal scope. */
  private mentionsTimeframe(text: string): boolean {
    const timeTerms = [
      'current', 'modern', 'historical', 'history', 'future',
      'recent', 'latest', 'evolution', 'trend', 'today',
      'past', 'present', '2024', '2023', '2025',
    ];
    const lower = text.toLowerCase();
    return timeTerms.some((term) => lower.includes(term));
  }

  /** Build a summary string from the original input and refinements. */
  private buildSummary(refinements: string[]): string {
    const parts: string[] = [
      `Topic: ${this.topic}`,
      `Use case: ${this.useCase}`,
    ];

    if (refinements.length > 0) {
      parts.push(`Refinements: ${refinements.join('; ')}`);
    }

    return parts.join('. ');
  }
}
