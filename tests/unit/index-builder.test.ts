import { describe, it, expect } from 'vitest';
import { buildIndex } from '../../src/writers/index-builder.js';
import { GeneratedFile } from '../../src/models/interfaces.js';

describe('IndexBuilder', () => {
  describe('buildIndex', () => {
    it('should produce an index starting with # Index heading', () => {
      const files: GeneratedFile[] = [
        {
          filename: 'basics.md',
          title: 'Basics',
          content: '# Basics\n\nThis covers the basic concepts of the topic. It provides foundational knowledge.',
          crossReferences: [],
        },
      ];

      const result = buildIndex(files);
      expect(result.startsWith('# Index\n')).toBe(true);
    });

    it('should produce correct format for a single file', () => {
      const files: GeneratedFile[] = [
        {
          filename: 'getting-started.md',
          title: 'Getting Started',
          content: '# Getting Started\n\nThis guide helps you get started with the system. It covers initial setup and configuration.',
          crossReferences: [],
        },
      ];

      const result = buildIndex(files);
      const lines = result.split('\n');

      expect(lines[0]).toBe('# Index');
      expect(lines[1]).toBe('');
      expect(lines[2]).toContain('[Getting Started](./getting-started.md)');
      expect(lines[2]).toContain(' — ');
    });

    it('should include one entry per file', () => {
      const files: GeneratedFile[] = [
        {
          filename: 'overview.md',
          title: 'Overview',
          content: '# Overview\n\nAn overview of the entire system. Covers architecture and design decisions.',
          crossReferences: [],
        },
        {
          filename: 'advanced-topics.md',
          title: 'Advanced Topics',
          content: '# Advanced Topics\n\nDeep dive into advanced features. Explores edge cases and optimizations.',
          crossReferences: [],
        },
        {
          filename: 'troubleshooting.md',
          title: 'Troubleshooting',
          content: '# Troubleshooting\n\nCommon issues and their solutions. Helps debug problems quickly.',
          crossReferences: [],
        },
      ];

      const result = buildIndex(files);
      const entryLines = result.split('\n').filter((line) => line.startsWith('- ['));

      expect(entryLines).toHaveLength(3);
      expect(entryLines[0]).toContain('[Overview](./overview.md)');
      expect(entryLines[1]).toContain('[Advanced Topics](./advanced-topics.md)');
      expect(entryLines[2]).toContain('[Troubleshooting](./troubleshooting.md)');
    });

    it('should produce an empty list for zero files', () => {
      const result = buildIndex([]);
      const lines = result.split('\n');

      expect(lines[0]).toBe('# Index');
      expect(lines[1]).toBe('');
      // No entry lines
      const entryLines = result.split('\n').filter((line) => line.startsWith('- ['));
      expect(entryLines).toHaveLength(0);
    });

    it('should extract description from file content', () => {
      const files: GeneratedFile[] = [
        {
          filename: 'data-models.md',
          title: 'Data Models',
          content: '# Data Models\n\nThis file describes the core data models used throughout the system. Each model is documented with its fields and constraints.',
          crossReferences: [],
        },
      ];

      const result = buildIndex(files);
      const entryLine = result.split('\n').find((line) => line.startsWith('- ['));

      expect(entryLine).toBeDefined();
      // Should contain a description after the em dash
      const parts = entryLine!.split(' — ');
      expect(parts.length).toBe(2);
      expect(parts[1]!.length).toBeGreaterThan(0);
    });

    it('should use relative links with ./ prefix', () => {
      const files: GeneratedFile[] = [
        {
          filename: 'api-reference.md',
          title: 'API Reference',
          content: '# API Reference\n\nComplete API documentation for all endpoints. Includes request and response schemas.',
          crossReferences: [],
        },
      ];

      const result = buildIndex(files);
      expect(result).toContain('](./api-reference.md)');
    });

    it('should handle files with section headings in content', () => {
      const files: GeneratedFile[] = [
        {
          filename: 'architecture.md',
          title: 'Architecture',
          content: '# Architecture\n\n## Introduction\n\nThe system follows a layered architecture pattern. Each layer has clear responsibilities and interfaces.',
          crossReferences: [],
        },
      ];

      const result = buildIndex(files);
      const entryLine = result.split('\n').find((line) => line.startsWith('- ['));
      const parts = entryLine!.split(' — ');

      // Description should come from body text, not from section headings
      expect(parts[1]).not.toContain('##');
      expect(parts[1]!.length).toBeGreaterThan(0);
    });

    it('should produce a fallback description when content has no body text', () => {
      const files: GeneratedFile[] = [
        {
          filename: 'empty-body.md',
          title: 'Empty Body',
          content: '# Empty Body\n\n',
          crossReferences: [],
        },
      ];

      const result = buildIndex(files);
      const entryLine = result.split('\n').find((line) => line.startsWith('- ['));
      const parts = entryLine!.split(' — ');

      expect(parts[1]!.length).toBeGreaterThan(0);
    });
  });
});
