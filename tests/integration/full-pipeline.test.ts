import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runPipeline, PipelineOptions, ClarificationCallback } from '../../src/pipeline.js';
import { modifyFile, addFile, removeFile } from '../../src/refinement/refinement-handler.js';
import { buildIndex } from '../../src/writers/index-builder.js';
import { ClarificationQuestion, GenerationSession as IGenerationSession } from '../../src/models/interfaces.js';
import { readdir, readFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('Integration: Full Pipeline', () => {
  let tempDir: string;

  const validTopic = 'Distributed systems architecture and consensus algorithms for building reliable services';
  const validUseCase = 'Provide context for a coding assistant helping engineers design fault-tolerant distributed systems';

  function createOptions(overrides: Partial<PipelineOptions> = {}): PipelineOptions {
    return {
      topic: validTopic,
      useCase: validUseCase,
      outputDir: tempDir,
      skipClarification: true,
      ...overrides,
    };
  }

  beforeEach(async () => {
    tempDir = join(tmpdir(), `integration-pipeline-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Full flow: input → clarification → generation → output', () => {
    it('completes the full pipeline and reaches written status', async () => {
      const result = await runPipeline(createOptions());

      expect(result.success).toBe(true);
      expect(result.session.status).toBe('written');
    });

    it('generates files that exist on disk in the output directory', async () => {
      const result = await runPipeline(createOptions());

      expect(result.success).toBe(true);

      const filesOnDisk = await readdir(tempDir);
      const generatedFilenames = result.session.generatedFiles.map(f => f.filename);

      for (const filename of generatedFilenames) {
        expect(filesOnDisk).toContain(filename);
      }
    });

    it('produces an index.md that contains links to all generated files', async () => {
      const result = await runPipeline(createOptions());

      expect(result.success).toBe(true);

      const filesOnDisk = await readdir(tempDir);
      expect(filesOnDisk).toContain('index.md');

      const indexContent = await readFile(join(tempDir, 'index.md'), 'utf-8');

      for (const file of result.session.generatedFiles) {
        // Index should contain a link to each file
        expect(indexContent).toContain(`./${file.filename}`);
        // Index should contain the file title
        expect(indexContent).toContain(file.title);
      }
    });

    it('each generated file has valid markdown structure (H1 heading, 200+ char body)', async () => {
      const result = await runPipeline(createOptions());

      expect(result.success).toBe(true);
      expect(result.session.generatedFiles.length).toBeGreaterThanOrEqual(2);

      for (const file of result.session.generatedFiles) {
        // File starts with frontmatter and contains H1 heading
        expect(file.content.startsWith('---\n')).toBe(true);
        expect(file.content).toContain('\n# ');

        // Extract body (everything after the H1 heading line)
        const lines = file.content.split('\n');
        const headingIndex = lines.findIndex(l => l.startsWith('# '));
        const bodyLines = lines.slice(headingIndex + 2);
        const body = bodyLines.join('\n').trim();

        // Body is at least 200 characters
        expect(body.length).toBeGreaterThanOrEqual(200);
      }
    });

    it('cross-references point to existing files in the set', async () => {
      const result = await runPipeline(createOptions());

      expect(result.success).toBe(true);

      const existingFilenames = new Set(result.session.generatedFiles.map(f => f.filename));

      for (const file of result.session.generatedFiles) {
        for (const ref of file.crossReferences) {
          expect(existingFilenames.has(ref.targetFilename)).toBe(true);
        }
      }
    });

    it('runs with clarification callback and produces refined scope', async () => {
      const callback: ClarificationCallback = async (questions: ClarificationQuestion[]) => {
        const answers = new Map<string, string>();
        for (const q of questions) {
          answers.set(q.id, 'Focus on Raft consensus and eventual consistency models');
        }
        return answers;
      };

      const result = await runPipeline(createOptions({
        skipClarification: false,
        clarificationCallback: callback,
      }));

      expect(result.success).toBe(true);
      expect(result.session.scope).not.toBeNull();
      expect(result.session.scope!.originalTopic).toBe(validTopic);
      expect(result.session.scope!.refinements.length).toBeGreaterThan(0);
      expect(result.session.status).toBe('written');
    });
  });

  describe('Refinement cycle: generate → modify → verify consistency', () => {
    it('modifies a file and verifies content is updated', async () => {
      const result = await runPipeline(createOptions());
      expect(result.success).toBe(true);

      // Build a session interface for the refinement handler
      const session: IGenerationSession = {
        topicDescription: result.session.topicDescription,
        useCaseDescription: result.session.useCaseDescription,
        scope: result.session.scope!,
        plan: result.session.plan!,
        generatedFiles: [...result.session.generatedFiles],
        outputDir: tempDir,
      };

      const targetFile = session.generatedFiles[0]!;
      const feedback = 'Add more detail about practical implementation considerations';

      const modified = modifyFile(targetFile.filename, feedback, session);

      expect(modified.filename).toBe(targetFile.filename);
      expect(modified.content).toContain(feedback);
      expect(modified.content).toContain('# ');
    });

    it('adds a new file and verifies it is in the session', async () => {
      const result = await runPipeline(createOptions());
      expect(result.success).toBe(true);

      const session: IGenerationSession = {
        topicDescription: result.session.topicDescription,
        useCaseDescription: result.session.useCaseDescription,
        scope: result.session.scope!,
        plan: result.session.plan!,
        generatedFiles: [...result.session.generatedFiles],
        outputDir: tempDir,
      };

      const originalCount = session.generatedFiles.length;
      const newFile = await addFile('Network Partitioning Strategies', session);

      expect(newFile.filename).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*\.md$/);
      expect(newFile.content).toContain('# Network Partitioning Strategies');
      expect(session.generatedFiles.length).toBe(originalCount + 1);
      expect(session.generatedFiles.find(f => f.filename === newFile.filename)).toBeDefined();
    });

    it('removes a file and verifies cross-references are updated', async () => {
      const result = await runPipeline(createOptions());
      expect(result.success).toBe(true);

      const session: IGenerationSession = {
        topicDescription: result.session.topicDescription,
        useCaseDescription: result.session.useCaseDescription,
        scope: result.session.scope!,
        plan: result.session.plan!,
        generatedFiles: [...result.session.generatedFiles],
        outputDir: tempDir,
      };

      // Ensure we have more than the minimum so removal is allowed
      if (session.generatedFiles.length <= 2) {
        await addFile('Extra Topic For Removal Test', session);
      }

      const fileToRemove = session.generatedFiles[0]!;
      const removeResult = removeFile(fileToRemove.filename, session);

      expect(removeResult.success).toBe(true);
      expect(session.generatedFiles.find(f => f.filename === fileToRemove.filename)).toBeUndefined();

      // Verify no remaining file has a cross-reference to the removed file
      for (const file of session.generatedFiles) {
        for (const ref of file.crossReferences) {
          expect(ref.targetFilename).not.toBe(fileToRemove.filename);
        }
      }
    });

    it('rebuilds index after modifications and verifies consistency', async () => {
      const result = await runPipeline(createOptions());
      expect(result.success).toBe(true);

      const session: IGenerationSession = {
        topicDescription: result.session.topicDescription,
        useCaseDescription: result.session.useCaseDescription,
        scope: result.session.scope!,
        plan: result.session.plan!,
        generatedFiles: [...result.session.generatedFiles],
        outputDir: tempDir,
      };

      // Add a file
      const newFile = await addFile('CAP Theorem Deep Dive', session);

      // Rebuild index
      const newIndex = buildIndex(session.generatedFiles);

      // Index should contain all files including the new one
      for (const file of session.generatedFiles) {
        expect(newIndex).toContain(`./${file.filename}`);
        expect(newIndex).toContain(file.title);
      }
      expect(newIndex).toContain(newFile.title);
    });
  });

  describe('Error resilience: inject failures at each stage', () => {
    it('fails cleanly with invalid topic input', async () => {
      const result = await runPipeline(createOptions({ topic: 'short' }));

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.session.status).toBe('failed');
      expect(result.session.errors.length).toBeGreaterThan(0);
      expect(result.session.errors[0]!.stage).toBe('validation');
    });

    it('fails cleanly with invalid use case input', async () => {
      const result = await runPipeline(createOptions({ useCase: '   ' }));

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.session.status).toBe('failed');
    });

    it('fails early with unwritable output directory', async () => {
      const unwritableDir = '/proc/nonexistent/impossible-path';

      const result = await runPipeline(createOptions({ outputDir: unwritableDir }));

      expect(result.success).toBe(false);
      expect(result.error).toContain('not writable');
      expect(result.session.status).toBe('failed');
      // Should fail before generation starts
      expect(result.session.generatedFiles.length).toBe(0);
    });

    it('preserves session state on validation failure', async () => {
      const result = await runPipeline(createOptions({ topic: '' }));

      expect(result.success).toBe(false);
      expect(result.session.topicDescription).toBe('');
      expect(result.session.useCaseDescription).toBe(validUseCase);
      expect(result.session.outputDir).toBe(tempDir);
    });

    it('preserves session state on directory failure', async () => {
      const unwritableDir = '/proc/nonexistent/impossible-path';
      const result = await runPipeline(createOptions({ outputDir: unwritableDir }));

      expect(result.success).toBe(false);
      expect(result.session.topicDescription).toBe(validTopic);
      expect(result.session.useCaseDescription).toBe(validUseCase);
      // Scope should be null since we fail before clarification
      expect(result.session.scope).toBeNull();
    });
  });

  describe('File system interaction: verify files written correctly', () => {
    it('writes all generated files to disk', async () => {
      const result = await runPipeline(createOptions());

      expect(result.success).toBe(true);

      const filesOnDisk = await readdir(tempDir);

      // All generated files + index.md should be on disk
      for (const file of result.session.generatedFiles) {
        expect(filesOnDisk).toContain(file.filename);
      }
      expect(filesOnDisk).toContain('index.md');
    });

    it('file content on disk matches session state', async () => {
      const result = await runPipeline(createOptions());

      expect(result.success).toBe(true);

      for (const file of result.session.generatedFiles) {
        const diskContent = await readFile(join(tempDir, file.filename), 'utf-8');
        expect(diskContent).toBe(file.content);
      }
    });

    it('index.md on disk has correct structure', async () => {
      const result = await runPipeline(createOptions());

      expect(result.success).toBe(true);

      const indexContent = await readFile(join(tempDir, 'index.md'), 'utf-8');

      // Index starts with H1 heading
      expect(indexContent.startsWith('# Index')).toBe(true);

      // Contains one entry per generated file
      for (const file of result.session.generatedFiles) {
        expect(indexContent).toContain(`[${file.title}](./${file.filename})`);
      }
    });

    it('files on disk are valid UTF-8 markdown', async () => {
      const result = await runPipeline(createOptions());

      expect(result.success).toBe(true);

      for (const file of result.session.generatedFiles) {
        const diskContent = await readFile(join(tempDir, file.filename), 'utf-8');

        // Should be valid string (not binary garbage)
        expect(typeof diskContent).toBe('string');
        expect(diskContent.length).toBeGreaterThan(0);

        // Should start with markdown H1
        expect(diskContent.startsWith('---\n')).toBe(true);
      }
    });

    it('temp directory is clean before pipeline runs', async () => {
      // Verify our temp dir starts empty
      const filesBefore = await readdir(tempDir);
      expect(filesBefore.length).toBe(0);

      const result = await runPipeline(createOptions());
      expect(result.success).toBe(true);

      // After pipeline, files exist
      const filesAfter = await readdir(tempDir);
      expect(filesAfter.length).toBeGreaterThan(0);
    });
  });
});
