import { describe, it, expect } from 'vitest';
import { GenerationSession, SerializedSession } from '../../src/session.js';
import { TopicScope, ContentPlan, GeneratedFile } from '../../src/models/interfaces.js';

describe('GenerationSession', () => {
  const topic = 'Machine learning fundamentals for beginners';
  const useCase = 'Provide context for a coding assistant helping with ML tasks';
  const outputDir = '/tmp/test-output';

  function createSession(): GenerationSession {
    return new GenerationSession(topic, useCase, outputDir);
  }

  function createScope(): TopicScope {
    return {
      originalTopic: topic,
      originalUseCase: useCase,
      refinements: ['Focus on supervised learning'],
      summary: 'Topic: ML fundamentals. Use case: coding assistant.',
    };
  }

  function createPlan(): ContentPlan {
    return {
      files: [
        {
          subtopic: 'Supervised Learning',
          filename: 'supervised-learning.md',
          description: 'Covers supervised learning basics.',
          relatedFiles: ['neural-networks.md'],
        },
        {
          subtopic: 'Neural Networks',
          filename: 'neural-networks.md',
          description: 'Covers neural network architecture.',
          relatedFiles: ['supervised-learning.md'],
        },
      ],
      estimatedTotal: 2,
    };
  }

  function createGeneratedFile(filename: string, title: string): GeneratedFile {
    return {
      filename,
      title,
      content: `# ${title}\n\n${'Content '.repeat(30)}`,
      crossReferences: [],
    };
  }

  describe('constructor and initial state', () => {
    it('initializes with provided values', () => {
      const session = createSession();
      expect(session.topicDescription).toBe(topic);
      expect(session.useCaseDescription).toBe(useCase);
      expect(session.outputDir).toBe(outputDir);
    });

    it('starts with initialized status', () => {
      const session = createSession();
      expect(session.status).toBe('initialized');
    });

    it('starts with null scope and plan', () => {
      const session = createSession();
      expect(session.scope).toBeNull();
      expect(session.plan).toBeNull();
    });

    it('starts with empty generated files and errors', () => {
      const session = createSession();
      expect(session.generatedFiles).toEqual([]);
      expect(session.errors).toEqual([]);
    });
  });

  describe('state transitions', () => {
    it('transitions to validated', () => {
      const session = createSession();
      session.setValidated();
      expect(session.status).toBe('validated');
    });

    it('transitions to clarified when scope is set', () => {
      const session = createSession();
      const scope = createScope();
      session.setScope(scope);
      expect(session.status).toBe('clarified');
      expect(session.scope).toEqual(scope);
    });

    it('transitions to planned when plan is set', () => {
      const session = createSession();
      const plan = createPlan();
      session.setPlan(plan);
      expect(session.status).toBe('planned');
      expect(session.plan).toEqual(plan);
    });

    it('transitions to generating', () => {
      const session = createSession();
      session.setGenerating();
      expect(session.status).toBe('generating');
    });

    it('transitions to generated', () => {
      const session = createSession();
      session.setGenerated();
      expect(session.status).toBe('generated');
    });

    it('transitions to indexed', () => {
      const session = createSession();
      session.setIndexed();
      expect(session.status).toBe('indexed');
    });

    it('transitions to written', () => {
      const session = createSession();
      session.setWritten();
      expect(session.status).toBe('written');
    });

    it('transitions to failed', () => {
      const session = createSession();
      session.setFailed();
      expect(session.status).toBe('failed');
    });
  });

  describe('file management', () => {
    it('adds generated files', () => {
      const session = createSession();
      const file = createGeneratedFile('test.md', 'Test');
      session.addGeneratedFile(file);
      expect(session.generatedFiles).toHaveLength(1);
      expect(session.generatedFiles[0]).toEqual(file);
    });

    it('returns a copy of generated files (immutable)', () => {
      const session = createSession();
      const file = createGeneratedFile('test.md', 'Test');
      session.addGeneratedFile(file);
      const files = session.generatedFiles;
      files.push(createGeneratedFile('other.md', 'Other'));
      expect(session.generatedFiles).toHaveLength(1);
    });

    it('replaces generated files with setGeneratedFiles', () => {
      const session = createSession();
      session.addGeneratedFile(createGeneratedFile('a.md', 'A'));
      session.addGeneratedFile(createGeneratedFile('b.md', 'B'));
      expect(session.generatedFiles).toHaveLength(2);

      const newFiles = [createGeneratedFile('c.md', 'C')];
      session.setGeneratedFiles(newFiles);
      expect(session.generatedFiles).toHaveLength(1);
      expect(session.generatedFiles[0]!.filename).toBe('c.md');
    });
  });

  describe('error tracking', () => {
    it('records errors with stage and message', () => {
      const session = createSession();
      session.addError('validation', 'Topic too short');
      expect(session.errors).toHaveLength(1);
      expect(session.errors[0]).toEqual({
        stage: 'validation',
        message: 'Topic too short',
        filename: undefined,
      });
    });

    it('records errors with optional filename', () => {
      const session = createSession();
      session.addError('generation', 'Failed to generate', 'test.md');
      expect(session.errors[0]!.filename).toBe('test.md');
    });

    it('returns a copy of errors (immutable)', () => {
      const session = createSession();
      session.addError('test', 'error');
      const errors = session.errors;
      errors.push({ stage: 'fake', message: 'fake' });
      expect(session.errors).toHaveLength(1);
    });
  });

  describe('serialization', () => {
    it('serializes to JSON', () => {
      const session = createSession();
      session.setScope(createScope());
      session.setPlan(createPlan());
      session.addGeneratedFile(createGeneratedFile('test.md', 'Test'));
      session.addError('generation', 'partial failure', 'other.md');

      const json = session.toJSON();
      expect(json.topicDescription).toBe(topic);
      expect(json.useCaseDescription).toBe(useCase);
      expect(json.outputDir).toBe(outputDir);
      expect(json.scope).toEqual(createScope());
      expect(json.plan).toEqual(createPlan());
      expect(json.generatedFiles).toHaveLength(1);
      expect(json.status).toBe('planned');
      expect(json.errors).toHaveLength(1);
    });

    it('deserializes from JSON', () => {
      const data: SerializedSession = {
        topicDescription: topic,
        useCaseDescription: useCase,
        scope: createScope(),
        plan: createPlan(),
        generatedFiles: [createGeneratedFile('test.md', 'Test')],
        outputDir,
        status: 'written',
        errors: [{ stage: 'generation', message: 'partial failure', filename: 'other.md' }],
      };

      const session = GenerationSession.fromJSON(data);
      expect(session.topicDescription).toBe(topic);
      expect(session.useCaseDescription).toBe(useCase);
      expect(session.scope).toEqual(createScope());
      expect(session.plan).toEqual(createPlan());
      expect(session.generatedFiles).toHaveLength(1);
      expect(session.outputDir).toBe(outputDir);
      expect(session.status).toBe('written');
      expect(session.errors).toHaveLength(1);
    });

    it('handles null scope and plan in deserialization', () => {
      const data: SerializedSession = {
        topicDescription: topic,
        useCaseDescription: useCase,
        scope: null,
        plan: null,
        generatedFiles: [],
        outputDir,
        status: 'initialized',
        errors: [],
      };

      const session = GenerationSession.fromJSON(data);
      expect(session.scope).toBeNull();
      expect(session.plan).toBeNull();
    });
  });
});
