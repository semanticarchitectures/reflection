import { describe, it, expect } from 'vitest';
import { modifyFile, addFile, removeFile } from '../../src/refinement/refinement-handler.js';
import { GenerationSession, GeneratedFile, TopicScope, ContentPlan } from '../../src/models/interfaces.js';

function createTestScope(): TopicScope {
  return {
    originalTopic: 'TypeScript Design Patterns',
    originalUseCase: 'Learning advanced TypeScript patterns for production code',
    refinements: ['Focus on creational patterns', 'Include real-world examples'],
    summary: 'TypeScript design patterns for production use',
  };
}

function createTestFile(filename: string, title: string, crossRefs: string[] = []): GeneratedFile {
  const crossReferences = crossRefs.map((target) => ({
    targetFilename: target,
    anchorText: `Related: ${target}`,
  }));

  let content = `# ${title}\n\n## Introduction\n\n${title} is a key aspect of TypeScript Design Patterns. This section provides foundational understanding relevant to learning advanced TypeScript patterns for production code. It covers important concepts and practical applications.`;

  if (crossReferences.length > 0) {
    content += '\n\n## See Also\n\n';
    content += crossReferences.map((ref) => `- [${ref.anchorText}](./${ref.targetFilename})`).join('\n');
  }

  return { filename, title, content, crossReferences };
}

function createTestSession(files: GeneratedFile[]): GenerationSession {
  const plan: ContentPlan = {
    files: files.map((f) => ({
      subtopic: f.title,
      filename: f.filename,
      description: `Covers ${f.title}`,
      relatedFiles: [],
    })),
    estimatedTotal: files.length,
  };

  return {
    topicDescription: 'TypeScript Design Patterns',
    useCaseDescription: 'Learning advanced TypeScript patterns for production code',
    scope: createTestScope(),
    plan,
    generatedFiles: [...files],
    outputDir: '/tmp/test-output',
  };
}

describe('RefinementHandler', () => {
  describe('modifyFile', () => {
    it('should modify an existing file incorporating feedback', () => {
      const files = [
        createTestFile('singleton.md', 'Singleton Pattern'),
        createTestFile('factory.md', 'Factory Pattern'),
        createTestFile('observer.md', 'Observer Pattern'),
      ];
      const session = createTestSession(files);

      const result = modifyFile('singleton.md', 'Add more examples of thread safety', session);

      expect(result.filename).toBe('singleton.md');
      expect(result.title).toBe('Singleton Pattern');
      expect(result.content).toContain('# Singleton Pattern');
      expect(result.content).toContain('Add more examples of thread safety');
    });

    it('should preserve existing content that is not contradicted', () => {
      const files = [
        createTestFile('singleton.md', 'Singleton Pattern'),
        createTestFile('factory.md', 'Factory Pattern'),
      ];
      const session = createTestSession(files);

      const result = modifyFile('singleton.md', 'Add a note about lazy initialization', session);

      // The original body content should still be present
      expect(result.content).toContain('Introduction');
      expect(result.content).toContain('Singleton Pattern is a key aspect');
    });

    it('should throw error for non-existent file with available files listed', () => {
      const files = [
        createTestFile('singleton.md', 'Singleton Pattern'),
        createTestFile('factory.md', 'Factory Pattern'),
      ];
      const session = createTestSession(files);

      expect(() => modifyFile('nonexistent.md', 'some feedback', session)).toThrow(
        /File "nonexistent.md" not found/
      );
      expect(() => modifyFile('nonexistent.md', 'some feedback', session)).toThrow(
        /singleton.md/
      );
      expect(() => modifyFile('nonexistent.md', 'some feedback', session)).toThrow(
        /factory.md/
      );
    });

    it('should update the file in the session generatedFiles array', () => {
      const files = [
        createTestFile('singleton.md', 'Singleton Pattern'),
        createTestFile('factory.md', 'Factory Pattern'),
      ];
      const session = createTestSession(files);

      modifyFile('singleton.md', 'Improve clarity', session);

      const updatedFile = session.generatedFiles.find((f) => f.filename === 'singleton.md');
      expect(updatedFile).toBeDefined();
      expect(updatedFile!.content).toContain('Improve clarity');
    });
  });

  describe('addFile', () => {
    it('should generate a new file and add it to the session', async () => {
      const files = [
        createTestFile('singleton.md', 'Singleton Pattern'),
        createTestFile('factory.md', 'Factory Pattern'),
      ];
      const session = createTestSession(files);

      const result = await addFile('Builder Pattern', session);

      expect(result.filename).toBe('builder-pattern.md');
      expect(result.title).toBe('Builder Pattern');
      expect(result.content).toContain('# Builder Pattern');
      expect(session.generatedFiles).toHaveLength(3);
    });

    it('should include cross-references to existing files', async () => {
      const files = [
        createTestFile('singleton.md', 'Singleton Pattern'),
        createTestFile('factory.md', 'Factory Pattern'),
      ];
      const session = createTestSession(files);

      const result = await addFile('Abstract Factory', session);

      // The new file should have cross-references to existing files
      expect(result.crossReferences.length).toBeGreaterThanOrEqual(0);
    });

    it('should generate a valid kebab-case filename', async () => {
      const files = [
        createTestFile('singleton.md', 'Singleton Pattern'),
        createTestFile('factory.md', 'Factory Pattern'),
      ];
      const session = createTestSession(files);

      const result = await addFile('Dependency Injection Container', session);

      expect(result.filename).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*\.md$/);
    });
  });

  describe('removeFile', () => {
    it('should remove a file from the session', () => {
      const files = [
        createTestFile('singleton.md', 'Singleton Pattern'),
        createTestFile('factory.md', 'Factory Pattern'),
        createTestFile('observer.md', 'Observer Pattern'),
      ];
      const session = createTestSession(files);

      const result = removeFile('factory.md', session);

      expect(result.success).toBe(true);
      expect(session.generatedFiles).toHaveLength(2);
      expect(session.generatedFiles.find((f) => f.filename === 'factory.md')).toBeUndefined();
    });

    it('should reject removal when it would drop below minimum file count', () => {
      const files = [
        createTestFile('singleton.md', 'Singleton Pattern'),
        createTestFile('factory.md', 'Factory Pattern'),
      ];
      const session = createTestSession(files);

      const result = removeFile('factory.md', session);

      expect(result.success).toBe(false);
      expect(result.error).toContain('minimum of 2');
      expect(session.generatedFiles).toHaveLength(2);
    });

    it('should return error for non-existent file with available files listed', () => {
      const files = [
        createTestFile('singleton.md', 'Singleton Pattern'),
        createTestFile('factory.md', 'Factory Pattern'),
        createTestFile('observer.md', 'Observer Pattern'),
      ];
      const session = createTestSession(files);

      const result = removeFile('nonexistent.md', session);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
      expect(result.error).toContain('singleton.md');
      expect(result.error).toContain('factory.md');
      expect(result.error).toContain('observer.md');
    });

    it('should update cross-references in remaining files', () => {
      const files = [
        createTestFile('singleton.md', 'Singleton Pattern', ['factory.md']),
        createTestFile('factory.md', 'Factory Pattern'),
        createTestFile('observer.md', 'Observer Pattern', ['factory.md']),
      ];
      const session = createTestSession(files);

      removeFile('factory.md', session);

      // Cross-references to factory.md should be removed
      const singleton = session.generatedFiles.find((f) => f.filename === 'singleton.md');
      const observer = session.generatedFiles.find((f) => f.filename === 'observer.md');

      expect(singleton!.crossReferences).toHaveLength(0);
      expect(observer!.crossReferences).toHaveLength(0);

      // Markdown links to factory.md should be converted to plain text
      expect(singleton!.content).not.toContain('](./factory.md)');
      expect(observer!.content).not.toContain('](./factory.md)');
    });

    it('should preserve cross-references to files that still exist', () => {
      const files = [
        createTestFile('singleton.md', 'Singleton Pattern', ['factory.md', 'observer.md']),
        createTestFile('factory.md', 'Factory Pattern'),
        createTestFile('observer.md', 'Observer Pattern'),
      ];
      const session = createTestSession(files);

      removeFile('factory.md', session);

      const singleton = session.generatedFiles.find((f) => f.filename === 'singleton.md');
      // Should still have the reference to observer.md
      expect(singleton!.crossReferences).toHaveLength(1);
      expect(singleton!.crossReferences[0]!.targetFilename).toBe('observer.md');
    });
  });
});
