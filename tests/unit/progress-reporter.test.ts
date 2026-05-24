import { describe, it, expect } from 'vitest';
import { ProgressReporter } from '../../src/reporters/progress-reporter.js';
import { GeneratedFile } from '../../src/models/interfaces.js';

describe('ProgressReporter', () => {
  function createReporterWithLog(): { reporter: ProgressReporter; messages: string[] } {
    const messages: string[] = [];
    const reporter = new ProgressReporter((msg) => messages.push(msg));
    return { reporter, messages };
  }

  describe('onStart', () => {
    it('reports generation started with estimated total', () => {
      const { reporter, messages } = createReporterWithLog();
      reporter.onStart(5);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain('started');
      expect(messages[0]).toContain('5');
    });

    it('resets internal state on each start', () => {
      const { reporter, messages } = createReporterWithLog();
      reporter.onFileError('fail.md', 'some error');
      reporter.onStart(3);
      // After onStart, errors should be cleared
      const files: GeneratedFile[] = [
        { filename: 'a.md', title: 'A', content: '# A\ncontent', crossReferences: [] },
      ];
      reporter.onComplete(files);
      // The summary should not mention the error from before onStart
      const summary = messages[messages.length - 1];
      expect(summary).not.toContain('fail.md');
    });
  });

  describe('onFileComplete', () => {
    it('reports filename and progress count', () => {
      const { reporter, messages } = createReporterWithLog();
      reporter.onFileComplete('overview.md', 1, 5);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain('overview.md');
      expect(messages[0]).toContain('1');
      expect(messages[0]).toContain('5');
    });

    it('reports correct counts for multiple files', () => {
      const { reporter, messages } = createReporterWithLog();
      reporter.onFileComplete('first.md', 1, 3);
      reporter.onFileComplete('second.md', 2, 3);
      reporter.onFileComplete('third.md', 3, 3);
      expect(messages).toHaveLength(3);
      expect(messages[0]).toContain('1/3');
      expect(messages[1]).toContain('2/3');
      expect(messages[2]).toContain('3/3');
    });
  });

  describe('onFileError', () => {
    it('reports filename and error message', () => {
      const { reporter, messages } = createReporterWithLog();
      reporter.onFileError('broken.md', 'timeout exceeded');
      expect(messages).toHaveLength(1);
      expect(messages[0]).toContain('broken.md');
      expect(messages[0]).toContain('timeout exceeded');
    });

    it('tracks errors for the final summary', () => {
      const { reporter, messages } = createReporterWithLog();
      reporter.onStart(2);
      reporter.onFileError('fail1.md', 'error one');
      reporter.onFileError('fail2.md', 'error two');
      reporter.onComplete([]);
      const summary = messages[messages.length - 1];
      expect(summary).toContain('fail1.md');
      expect(summary).toContain('fail2.md');
      expect(summary).toContain('Errors encountered: 2');
    });
  });

  describe('onComplete', () => {
    it('presents summary with all generated files', () => {
      const { reporter, messages } = createReporterWithLog();
      const files: GeneratedFile[] = [
        { filename: 'intro.md', title: 'Introduction', content: '# Introduction\ncontent', crossReferences: [] },
        { filename: 'details.md', title: 'Details', content: '# Details\ncontent', crossReferences: [] },
      ];
      reporter.onStart(2);
      reporter.onComplete(files);
      const summary = messages[messages.length - 1];
      expect(summary).toContain('2 file(s) generated');
      expect(summary).toContain('intro.md');
      expect(summary).toContain('Introduction');
      expect(summary).toContain('details.md');
      expect(summary).toContain('Details');
    });

    it('handles empty file list', () => {
      const { reporter, messages } = createReporterWithLog();
      reporter.onStart(0);
      reporter.onComplete([]);
      const summary = messages[messages.length - 1];
      expect(summary).toContain('0 file(s) generated');
    });

    it('includes errors in the summary when present', () => {
      const { reporter, messages } = createReporterWithLog();
      const files: GeneratedFile[] = [
        { filename: 'success.md', title: 'Success', content: '# Success\ncontent', crossReferences: [] },
      ];
      reporter.onStart(2);
      reporter.onFileError('failed.md', 'generation timeout');
      reporter.onFileComplete('success.md', 1, 2);
      reporter.onComplete(files);
      const summary = messages[messages.length - 1];
      expect(summary).toContain('1 file(s) generated');
      expect(summary).toContain('success.md');
      expect(summary).toContain('failed.md');
      expect(summary).toContain('generation timeout');
    });
  });

  describe('default callback', () => {
    it('uses console.log when no callback provided', () => {
      // Just verify it constructs without error
      const reporter = new ProgressReporter();
      expect(reporter).toBeDefined();
    });
  });
});
