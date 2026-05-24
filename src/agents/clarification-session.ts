/**
 * Manages the state of a clarification session.
 * Tracks rounds, questions asked, answers received, and enforces limits.
 */

import { ClarificationQuestion } from '../models/interfaces.js';

export class ClarificationSession {
  private _round: number = 1;
  private _questionsAsked: ClarificationQuestion[] = [];
  private _answersReceived: Map<string, string> = new Map();
  private _skipped: boolean = false;

  readonly maxRounds: number = 3;
  readonly maxQuestionsPerRound: number = 3;
  readonly totalQuestionsLimit: number = 5;

  /** Current round number (1-based). */
  get round(): number {
    return this._round;
  }

  /** All questions asked across all rounds. */
  get questionsAsked(): ClarificationQuestion[] {
    return [...this._questionsAsked];
  }

  /** Map of question ID to answer text. */
  get answersReceived(): Map<string, string> {
    return new Map(this._answersReceived);
  }

  /** Whether the session was skipped entirely. */
  get skipped(): boolean {
    return this._skipped;
  }

  /**
   * Add a batch of questions for the current round.
   * Enforces max 3 questions per batch and max 5 total questions.
   * Returns the questions actually added (may be fewer than provided if limits are hit).
   */
  addQuestions(questions: ClarificationQuestion[]): ClarificationQuestion[] {
    if (this._skipped || this.isComplete()) {
      return [];
    }

    const remainingCapacity = this.totalQuestionsLimit - this._questionsAsked.length;
    const batchLimit = Math.min(this.maxQuestionsPerRound, remainingCapacity);
    const toAdd = questions.slice(0, batchLimit);

    this._questionsAsked.push(...toAdd);
    return toAdd;
  }

  /**
   * Record an answer for a question.
   * Empty or whitespace-only answers are treated as unanswered (not recorded).
   */
  recordAnswer(questionId: string, answer: string): void {
    if (this._skipped) {
      return;
    }

    const trimmed = answer.trim();
    if (trimmed.length === 0) {
      // Treat empty/non-responsive answers as unanswered
      return;
    }

    // Only record if the question was actually asked
    const questionExists = this._questionsAsked.some(q => q.id === questionId);
    if (questionExists) {
      this._answersReceived.set(questionId, trimmed);
    }
  }

  /**
   * Advance to the next round.
   * Returns false if already at max rounds or session is complete.
   */
  advanceRound(): boolean {
    if (this._skipped || this._round >= this.maxRounds || this.isComplete()) {
      return false;
    }

    this._round += 1;
    return true;
  }

  /**
   * Get the questions from the current round that haven't been answered yet.
   */
  getCurrentRoundUnanswered(): ClarificationQuestion[] {
    // Questions for the current round are the ones added in the most recent batch
    // We track by looking at questions that don't have answers
    return this._questionsAsked.filter(q => !this._answersReceived.has(q.id));
  }

  /**
   * Check if the session is complete.
   * Complete when:
   * - Session was skipped, OR
   * - All questions have been answered, OR
   * - Max rounds have been reached (round > maxRounds after advancing)
   */
  isComplete(): boolean {
    if (this._skipped) {
      return true;
    }

    // All questions answered
    if (
      this._questionsAsked.length > 0 &&
      this._answersReceived.size >= this._questionsAsked.length
    ) {
      return true;
    }

    // Exceeded max rounds (round was advanced past maxRounds)
    if (this._round > this.maxRounds) {
      return true;
    }

    return false;
  }

  /**
   * Skip the clarification session entirely.
   * The system will proceed with the original input without modification.
   */
  skip(): void {
    this._skipped = true;
  }

  /**
   * Get the total number of questions that can still be asked.
   */
  getRemainingQuestionCapacity(): number {
    return Math.max(0, this.totalQuestionsLimit - this._questionsAsked.length);
  }

  /**
   * Get all answered question-answer pairs.
   */
  getAnsweredPairs(): Array<{ question: ClarificationQuestion; answer: string }> {
    const pairs: Array<{ question: ClarificationQuestion; answer: string }> = [];
    for (const question of this._questionsAsked) {
      const answer = this._answersReceived.get(question.id);
      if (answer !== undefined) {
        pairs.push({ question, answer });
      }
    }
    return pairs;
  }
}
