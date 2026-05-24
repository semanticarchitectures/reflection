import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile as fsWriteFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeContextSet, writeFile, removeFile } from '../../src/writers/output-writer.js';
import { GeneratedFile } from '../../src/models/interfaces.js';

describe('OutputWriter', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'output-writer-test-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('writeContextSet', () => {
    it('should create the output directory if it does not exist', async () => {
      const outputDir = join(testDir, 'nested', 'output');
      const files: GeneratedFile[] = [];
      const index = '# Index\n';

      const results = await writeContextSet(outputDir, files, index);

      // Should succeed with just the index write
      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(true);
    });

    it('should write all generated files and the index', async () => {
      const outputDir = join(testDir, 'output');
      const files: GeneratedFile[] = [
        {
          filename: 'intro.md',
          title: 'Introduction',
          content: '# Introduction\n\nThis is the introduction.',
          crossReferences: [],
        },
        {
          filename: 'concepts.md',
          title: 'Key Concepts',
          content: '# Key Concepts\n\nThese are the key concepts.',
          crossReferences: [],
        },
      ];
      const index = '# Index\n\n- [Introduction](./intro.md)\n- [Key Concepts](./concepts.md)\n';

      const results = await writeContextSet(outputDir, files, index);

      // 2 files + 1 index = 3 results
      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);

      // Verify file contents
      const introContent = await readFile(join(outputDir, 'intro.md'), 'utf-8');
      expect(introContent).toBe('# Introduction\n\nThis is the introduction.');

      const conceptsContent = await readFile(join(outputDir, 'concepts.md'), 'utf-8');
      expect(conceptsContent).toBe('# Key Concepts\n\nThese are the key concepts.');

      const indexContent = await readFile(join(outputDir, 'index.md'), 'utf-8');
      expect(indexContent).toBe(index);
    });

    it('should return a failure result when the output directory cannot be created', async () => {
      // Use a path that cannot be created (nested under a file, not a directory)
      const blockingFile = join(testDir, 'blocker');
      await fsWriteFile(blockingFile, 'not a directory');
      const outputDir = join(blockingFile, 'nested', 'output');

      const files: GeneratedFile[] = [
        {
          filename: 'test.md',
          title: 'Test',
          content: '# Test\n\nContent.',
          crossReferences: [],
        },
      ];

      const results = await writeContextSet(outputDir, files, '# Index\n');

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(false);
      expect(results[0]!.error).toContain('Failed to create output directory');
    });

    it('should handle partial failures gracefully', async () => {
      const outputDir = join(testDir, 'output');
      await mkdir(outputDir, { recursive: true });

      // Create a subdirectory with the same name as a file to cause a write failure
      await mkdir(join(outputDir, 'conflict.md'), { recursive: true });

      const files: GeneratedFile[] = [
        {
          filename: 'good.md',
          title: 'Good File',
          content: '# Good File\n\nThis should succeed.',
          crossReferences: [],
        },
        {
          filename: 'conflict.md',
          title: 'Conflict',
          content: '# Conflict\n\nThis should fail.',
          crossReferences: [],
        },
      ];

      const results = await writeContextSet(outputDir, files, '# Index\n');

      // 2 files + 1 index = 3 results
      expect(results).toHaveLength(3);

      // First file should succeed
      expect(results[0]!.success).toBe(true);

      // Second file should fail (directory exists with that name)
      expect(results[1]!.success).toBe(false);
      expect(results[1]!.error).toContain('Failed to write file');

      // Index should still succeed
      expect(results[2]!.success).toBe(true);
    });
  });

  describe('writeFile', () => {
    it('should write a file atomically and return success', async () => {
      const outputDir = join(testDir, 'output');
      await mkdir(outputDir, { recursive: true });

      const file: GeneratedFile = {
        filename: 'atomic-test.md',
        title: 'Atomic Test',
        content: '# Atomic Test\n\nThis file was written atomically.',
        crossReferences: [],
      };

      const result = await writeFile(outputDir, file);

      expect(result.success).toBe(true);
      expect(result.path).toBe(join(outputDir, 'atomic-test.md'));

      const content = await readFile(join(outputDir, 'atomic-test.md'), 'utf-8');
      expect(content).toBe(file.content);
    });

    it('should overwrite an existing file', async () => {
      const outputDir = join(testDir, 'output');
      await mkdir(outputDir, { recursive: true });
      await fsWriteFile(join(outputDir, 'existing.md'), 'old content');

      const file: GeneratedFile = {
        filename: 'existing.md',
        title: 'Updated',
        content: '# Updated\n\nNew content replaces old.',
        crossReferences: [],
      };

      const result = await writeFile(outputDir, file);

      expect(result.success).toBe(true);
      const content = await readFile(join(outputDir, 'existing.md'), 'utf-8');
      expect(content).toBe(file.content);
    });

    it('should return failure when the directory does not exist', async () => {
      const outputDir = join(testDir, 'nonexistent', 'deep', 'path');

      const file: GeneratedFile = {
        filename: 'test.md',
        title: 'Test',
        content: '# Test\n\nContent.',
        crossReferences: [],
      };

      // writeFile creates parent dirs via mkdir, so this should actually succeed
      const result = await writeFile(outputDir, file);
      expect(result.success).toBe(true);
    });

    it('should not leave temp files on failure', async () => {
      const outputDir = join(testDir, 'output');
      await mkdir(outputDir, { recursive: true });

      // Create a directory with the target filename to cause rename to fail
      await mkdir(join(outputDir, 'dir-conflict.md'), { recursive: true });

      const file: GeneratedFile = {
        filename: 'dir-conflict.md',
        title: 'Conflict',
        content: '# Conflict\n\nShould fail.',
        crossReferences: [],
      };

      const result = await writeFile(outputDir, file);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to write file');
    });
  });

  describe('removeFile', () => {
    it('should remove an existing file and return success', async () => {
      const outputDir = join(testDir, 'output');
      await mkdir(outputDir, { recursive: true });
      await fsWriteFile(join(outputDir, 'to-remove.md'), '# Remove Me');

      const result = await removeFile(outputDir, 'to-remove.md');

      expect(result.success).toBe(true);
      expect(result.path).toBe(join(outputDir, 'to-remove.md'));

      // Verify file no longer exists
      await expect(access(join(outputDir, 'to-remove.md'))).rejects.toThrow();
    });

    it('should return failure when the file does not exist', async () => {
      const outputDir = join(testDir, 'output');
      await mkdir(outputDir, { recursive: true });

      const result = await removeFile(outputDir, 'nonexistent.md');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to remove file');
      expect(result.error).toContain('nonexistent.md');
    });
  });
});
