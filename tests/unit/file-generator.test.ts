import { describe, it, expect } from 'vitest';
import { generateFile } from '../../src/generators/file-generator.js';
import { PlannedFile, TopicScope, GeneratedFile } from '../../src/models/interfaces.js';

describe('FileGenerator', () => {
  const baseScope: TopicScope = {
    originalTopic: 'Machine Learning',
    originalUseCase: 'building a recommendation system',
    refinements: ['collaborative filtering', 'content-based approaches'],
    summary: 'Machine learning techniques for recommendation systems',
  };

  const basePlannedFile: PlannedFile = {
    subtopic: 'Neural Networks',
    filename: 'neural-networks.md',
    description: 'Covers neural networks in the context of the topic.',
    relatedFiles: ['deep-learning.md', 'optimization.md'],
  };

  describe('generateFile', () => {
    it('should return a GeneratedFile with correct filename and title', () => {
      const result = generateFile(basePlannedFile, baseScope, []);

      expect(result.filename).toBe('neural-networks.md');
      expect(result.title).toBe('Neural Networks');
    });

    it('should produce content starting with an H1 heading', () => {
      const result = generateFile(basePlannedFile, baseScope, []);

      const firstLine = result.content.split('\n')[0];
      expect(firstLine).toBe('# Neural Networks');
    });

    it('should produce body content of at least 200 characters', () => {
      const result = generateFile(basePlannedFile, baseScope, []);

      // Body is everything after the H1 heading line and the blank line
      const lines = result.content.split('\n');
      const bodyContent = lines.slice(2).join('\n');
      expect(bodyContent.length).toBeGreaterThanOrEqual(200);
    });

    it('should include cross-references only for files that exist', () => {
      const existingFiles: GeneratedFile[] = [
        {
          filename: 'deep-learning.md',
          title: 'Deep Learning',
          content: '# Deep Learning\n\nContent here.',
          crossReferences: [],
        },
      ];

      const result = generateFile(basePlannedFile, baseScope, existingFiles);

      // Should include deep-learning.md (exists) but not optimization.md (doesn't exist)
      expect(result.crossReferences).toHaveLength(1);
      expect(result.crossReferences[0]!.targetFilename).toBe('deep-learning.md');
      expect(result.crossReferences[0]!.anchorText).toBe('Related: Deep Learning');
    });

    it('should omit cross-references when no related files exist', () => {
      const result = generateFile(basePlannedFile, baseScope, []);

      expect(result.crossReferences).toHaveLength(0);
    });

    it('should format cross-references as relative markdown links', () => {
      const existingFiles: GeneratedFile[] = [
        {
          filename: 'deep-learning.md',
          title: 'Deep Learning',
          content: '# Deep Learning\n\nContent here.',
          crossReferences: [],
        },
      ];

      const result = generateFile(basePlannedFile, baseScope, existingFiles);

      expect(result.content).toContain('[Related: Deep Learning](./deep-learning.md)');
    });

    it('should not include cross-reference links for non-existent files', () => {
      const result = generateFile(basePlannedFile, baseScope, []);

      // optimization.md is in relatedFiles but doesn't exist
      expect(result.content).not.toContain('optimization.md');
    });

    it('should include multiple cross-references when multiple related files exist', () => {
      const existingFiles: GeneratedFile[] = [
        {
          filename: 'deep-learning.md',
          title: 'Deep Learning',
          content: '# Deep Learning\n\nContent.',
          crossReferences: [],
        },
        {
          filename: 'optimization.md',
          title: 'Optimization',
          content: '# Optimization\n\nContent.',
          crossReferences: [],
        },
      ];

      const result = generateFile(basePlannedFile, baseScope, existingFiles);

      expect(result.crossReferences).toHaveLength(2);
      expect(result.content).toContain('[Related: Deep Learning](./deep-learning.md)');
      expect(result.content).toContain('[Related: Optimization](./optimization.md)');
    });

    it('should handle a planned file with no related files', () => {
      const isolated: PlannedFile = {
        subtopic: 'Standalone Topic',
        filename: 'standalone-topic.md',
        description: 'A standalone topic with no relations.',
        relatedFiles: [],
      };

      const result = generateFile(isolated, baseScope, []);

      expect(result.crossReferences).toHaveLength(0);
      expect(result.content).not.toContain('## See Also');
    });

    it('should include a See Also section when cross-references exist', () => {
      const existingFiles: GeneratedFile[] = [
        {
          filename: 'deep-learning.md',
          title: 'Deep Learning',
          content: '# Deep Learning\n\nContent.',
          crossReferences: [],
        },
      ];

      const result = generateFile(basePlannedFile, baseScope, existingFiles);

      expect(result.content).toContain('## See Also');
    });

    it('should generate valid markdown content', () => {
      const result = generateFile(basePlannedFile, baseScope, []);

      // Should contain section headings
      expect(result.content).toContain('## Introduction');
      expect(result.content).toContain('## Key Concepts');
      expect(result.content).toContain('## Relationships');
    });

    it('should incorporate the topic scope into the content', () => {
      const result = generateFile(basePlannedFile, baseScope, []);

      expect(result.content).toContain('Machine Learning');
      expect(result.content).toContain('building a recommendation system');
    });

    it('should work with an empty refinements array', () => {
      const scopeNoRefinements: TopicScope = {
        originalTopic: 'Testing',
        originalUseCase: 'writing unit tests',
        refinements: [],
        summary: 'Testing fundamentals',
      };

      const planned: PlannedFile = {
        subtopic: 'Test Strategies',
        filename: 'test-strategies.md',
        description: 'Covers test strategies.',
        relatedFiles: [],
      };

      const result = generateFile(planned, scopeNoRefinements, []);

      expect(result.filename).toBe('test-strategies.md');
      expect(result.title).toBe('Test Strategies');
      expect(result.content.startsWith('# Test Strategies')).toBe(true);

      const bodyContent = result.content.split('\n').slice(2).join('\n');
      expect(bodyContent.length).toBeGreaterThanOrEqual(200);
    });
  });
});
