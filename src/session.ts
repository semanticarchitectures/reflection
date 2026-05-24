/**
 * GenerationSession module.
 *
 * Holds the accumulated state for a single context generation request.
 * Provides methods to update state as the pipeline progresses and
 * supports serialization for potential persistence.
 *
 * Requirements: 1.3, 3.6, 5.4
 */

import {
  TopicScope,
  ContentPlan,
  GeneratedFile,
} from './models/interfaces.js';

/**
 * Serializable representation of a GenerationSession.
 * Used for persistence and state transfer.
 */
export interface SerializedSession {
  topicDescription: string;
  useCaseDescription: string;
  scope: TopicScope | null;
  plan: ContentPlan | null;
  generatedFiles: GeneratedFile[];
  outputDir: string;
  status: SessionStatus;
  errors: SessionError[];
}

/** Possible states of a generation session. */
export type SessionStatus =
  | 'initialized'
  | 'validated'
  | 'clarified'
  | 'planned'
  | 'generating'
  | 'generated'
  | 'indexed'
  | 'written'
  | 'failed';

/** An error that occurred during a specific pipeline stage. */
export interface SessionError {
  stage: string;
  message: string;
  filename?: string | undefined;
}

/**
 * GenerationSession holds all accumulated state for a context generation request.
 *
 * It tracks the progression through the pipeline stages and provides
 * methods to update state at each step. The session is serializable
 * for potential persistence or transfer.
 */
export class GenerationSession {
  private _topicDescription: string;
  private _useCaseDescription: string;
  private _scope: TopicScope | null = null;
  private _plan: ContentPlan | null = null;
  private _generatedFiles: GeneratedFile[] = [];
  private _outputDir: string;
  private _status: SessionStatus = 'initialized';
  private _errors: SessionError[] = [];

  constructor(topicDescription: string, useCaseDescription: string, outputDir: string) {
    this._topicDescription = topicDescription;
    this._useCaseDescription = useCaseDescription;
    this._outputDir = outputDir;
  }

  // --- Getters ---

  get topicDescription(): string {
    return this._topicDescription;
  }

  get useCaseDescription(): string {
    return this._useCaseDescription;
  }

  get scope(): TopicScope | null {
    return this._scope;
  }

  get plan(): ContentPlan | null {
    return this._plan;
  }

  get generatedFiles(): GeneratedFile[] {
    return [...this._generatedFiles];
  }

  get outputDir(): string {
    return this._outputDir;
  }

  get status(): SessionStatus {
    return this._status;
  }

  get errors(): SessionError[] {
    return [...this._errors];
  }

  // --- State update methods ---

  /** Mark inputs as validated. */
  setValidated(): void {
    this._status = 'validated';
  }

  /** Set the refined topic scope after clarification. */
  setScope(scope: TopicScope): void {
    this._scope = scope;
    this._status = 'clarified';
  }

  /** Set the content plan after planning. */
  setPlan(plan: ContentPlan): void {
    this._plan = plan;
    this._status = 'planned';
  }

  /** Mark the session as currently generating files. */
  setGenerating(): void {
    this._status = 'generating';
  }

  /** Add a successfully generated file. */
  addGeneratedFile(file: GeneratedFile): void {
    this._generatedFiles.push(file);
  }

  /** Mark file generation as complete. */
  setGenerated(): void {
    this._status = 'generated';
  }

  /** Mark the index as built. */
  setIndexed(): void {
    this._status = 'indexed';
  }

  /** Mark output as written to disk. */
  setWritten(): void {
    this._status = 'written';
  }

  /** Mark the session as failed. */
  setFailed(): void {
    this._status = 'failed';
  }

  /** Record an error that occurred during a pipeline stage. */
  addError(stage: string, message: string, filename?: string): void {
    this._errors.push({ stage, message, filename });
  }

  /**
   * Replace the generated files list (used after refinement operations).
   */
  setGeneratedFiles(files: GeneratedFile[]): void {
    this._generatedFiles = [...files];
  }

  // --- Serialization ---

  /** Serialize the session to a plain object for persistence. */
  toJSON(): SerializedSession {
    return {
      topicDescription: this._topicDescription,
      useCaseDescription: this._useCaseDescription,
      scope: this._scope,
      plan: this._plan,
      generatedFiles: this._generatedFiles,
      outputDir: this._outputDir,
      status: this._status,
      errors: this._errors,
    };
  }

  /** Restore a session from a serialized representation. */
  static fromJSON(data: SerializedSession): GenerationSession {
    const session = new GenerationSession(
      data.topicDescription,
      data.useCaseDescription,
      data.outputDir
    );
    if (data.scope) {
      session._scope = data.scope;
    }
    if (data.plan) {
      session._plan = data.plan;
    }
    session._generatedFiles = data.generatedFiles;
    session._status = data.status;
    session._errors = data.errors;
    return session;
  }
}
