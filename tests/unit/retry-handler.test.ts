import { describe, it, expect, vi } from 'vitest';
import { RetryHandler } from '../../src/llm/retry-handler.js';

describe('RetryHandler', () => {
  // Use a no-op delay for fast tests
  const noDelay = async (_ms: number) => {};

  describe('execute - immediate success', () => {
    it('returns the result on first attempt success', async () => {
      const handler = new RetryHandler(undefined, noDelay);
      const result = await handler.execute(async () => 'success');
      expect(result).toBe('success');
    });

    it('calls the operation only once on success', async () => {
      const handler = new RetryHandler(undefined, noDelay);
      const operation = vi.fn().mockResolvedValue(42);
      await handler.execute(operation);
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('execute - retryable errors', () => {
    it('retries on HTTP 429 and returns success', async () => {
      const handler = new RetryHandler(undefined, noDelay);
      let attempt = 0;
      const result = await handler.execute(async () => {
        attempt++;
        if (attempt < 2) {
          throw { status: 429, message: 'Too Many Requests' };
        }
        return 'recovered';
      });
      expect(result).toBe('recovered');
      expect(attempt).toBe(2);
    });

    it('retries on HTTP 500', async () => {
      const handler = new RetryHandler(undefined, noDelay);
      let attempt = 0;
      const result = await handler.execute(async () => {
        attempt++;
        if (attempt < 3) {
          throw { status: 500, message: 'Internal Server Error' };
        }
        return 'recovered';
      });
      expect(result).toBe('recovered');
      expect(attempt).toBe(3);
    });

    it('retries on HTTP 503', async () => {
      const handler = new RetryHandler(undefined, noDelay);
      let attempt = 0;
      const result = await handler.execute(async () => {
        attempt++;
        if (attempt < 2) {
          throw { status: 503, message: 'Service Unavailable' };
        }
        return 'ok';
      });
      expect(result).toBe('ok');
    });

    it('retries on ETIMEDOUT error code', async () => {
      const handler = new RetryHandler(undefined, noDelay);
      let attempt = 0;
      const result = await handler.execute(async () => {
        attempt++;
        if (attempt < 2) {
          throw { code: 'ETIMEDOUT', message: 'Connection timed out' };
        }
        return 'ok';
      });
      expect(result).toBe('ok');
    });

    it('retries on ECONNRESET error code', async () => {
      const handler = new RetryHandler(undefined, noDelay);
      let attempt = 0;
      const result = await handler.execute(async () => {
        attempt++;
        if (attempt < 2) {
          throw { code: 'ECONNRESET', message: 'Connection reset' };
        }
        return 'ok';
      });
      expect(result).toBe('ok');
    });

    it('retries on ECONNREFUSED error code', async () => {
      const handler = new RetryHandler(undefined, noDelay);
      let attempt = 0;
      const result = await handler.execute(async () => {
        attempt++;
        if (attempt < 2) {
          throw { code: 'ECONNREFUSED', message: 'Connection refused' };
        }
        return 'ok';
      });
      expect(result).toBe('ok');
    });

    it('retries on ENOTFOUND error code', async () => {
      const handler = new RetryHandler(undefined, noDelay);
      let attempt = 0;
      const result = await handler.execute(async () => {
        attempt++;
        if (attempt < 2) {
          throw { code: 'ENOTFOUND', message: 'DNS lookup failed' };
        }
        return 'ok';
      });
      expect(result).toBe('ok');
    });

    it('retries on error with "timeout" in message', async () => {
      const handler = new RetryHandler(undefined, noDelay);
      let attempt = 0;
      const result = await handler.execute(async () => {
        attempt++;
        if (attempt < 2) {
          throw new Error('Request timeout exceeded');
        }
        return 'ok';
      });
      expect(result).toBe('ok');
    });

    it('retries on error with "Timeout" in message (case-insensitive)', async () => {
      const handler = new RetryHandler(undefined, noDelay);
      let attempt = 0;
      const result = await handler.execute(async () => {
        attempt++;
        if (attempt < 2) {
          throw new Error('Connection Timeout');
        }
        return 'ok';
      });
      expect(result).toBe('ok');
    });

    it('throws the final error after all attempts exhausted', async () => {
      const handler = new RetryHandler({ maxAttempts: 3 }, noDelay);
      const error = { status: 500, message: 'Server Error' };
      await expect(
        handler.execute(async () => {
          throw error;
        })
      ).rejects.toEqual(error);
    });

    it('makes exactly maxAttempts calls before giving up', async () => {
      const handler = new RetryHandler({ maxAttempts: 3 }, noDelay);
      const operation = vi.fn().mockRejectedValue({ status: 429, message: 'Rate limited' });
      await expect(handler.execute(operation)).rejects.toBeDefined();
      expect(operation).toHaveBeenCalledTimes(3);
    });
  });

  describe('execute - non-retryable errors', () => {
    it('throws immediately on HTTP 400', async () => {
      const handler = new RetryHandler(undefined, noDelay);
      const operation = vi.fn().mockRejectedValue({ status: 400, message: 'Bad Request' });
      await expect(handler.execute(operation)).rejects.toEqual({ status: 400, message: 'Bad Request' });
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('throws immediately on HTTP 401', async () => {
      const handler = new RetryHandler(undefined, noDelay);
      const operation = vi.fn().mockRejectedValue({ status: 401, message: 'Unauthorized' });
      await expect(handler.execute(operation)).rejects.toEqual({ status: 401, message: 'Unauthorized' });
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('throws immediately on HTTP 403', async () => {
      const handler = new RetryHandler(undefined, noDelay);
      const operation = vi.fn().mockRejectedValue({ status: 403, message: 'Forbidden' });
      await expect(handler.execute(operation)).rejects.toEqual({ status: 403, message: 'Forbidden' });
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('execute - backoff timing', () => {
    it('uses exponential backoff: 1s, 2s, 4s with default baseDelayMs', async () => {
      const delays: number[] = [];
      const trackingDelay = async (ms: number) => { delays.push(ms); };
      const handler = new RetryHandler({ maxAttempts: 4, baseDelayMs: 1000 }, trackingDelay);

      let attempt = 0;
      await handler.execute(async () => {
        attempt++;
        if (attempt < 4) {
          throw { status: 500, message: 'error' };
        }
        return 'ok';
      });

      expect(delays).toEqual([1000, 2000, 4000]);
    });

    it('uses custom baseDelayMs for backoff calculation', async () => {
      const delays: number[] = [];
      const trackingDelay = async (ms: number) => { delays.push(ms); };
      const handler = new RetryHandler({ maxAttempts: 3, baseDelayMs: 500 }, trackingDelay);

      await expect(
        handler.execute(async () => {
          throw { status: 503, message: 'unavailable' };
        })
      ).rejects.toBeDefined();

      // 500 * 2^0 = 500, 500 * 2^1 = 1000
      expect(delays).toEqual([500, 1000]);
    });

    it('does not delay after the final failed attempt', async () => {
      const delays: number[] = [];
      const trackingDelay = async (ms: number) => { delays.push(ms); };
      const handler = new RetryHandler({ maxAttempts: 3, baseDelayMs: 1000 }, trackingDelay);

      await expect(
        handler.execute(async () => {
          throw { status: 429, message: 'rate limited' };
        })
      ).rejects.toBeDefined();

      // Only 2 delays for 3 attempts (no delay after the last failure)
      expect(delays).toHaveLength(2);
    });
  });

  describe('execute - custom options', () => {
    it('respects maxAttempts of 1 (no retries)', async () => {
      const handler = new RetryHandler({ maxAttempts: 1 }, noDelay);
      const operation = vi.fn().mockRejectedValue({ status: 500, message: 'error' });
      await expect(handler.execute(operation)).rejects.toBeDefined();
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('uses default options when none provided', async () => {
      const delays: number[] = [];
      const trackingDelay = async (ms: number) => { delays.push(ms); };
      const handler = new RetryHandler(undefined, trackingDelay);

      const operation = vi.fn().mockRejectedValue({ status: 500, message: 'error' });
      await expect(handler.execute(operation)).rejects.toBeDefined();

      // Default maxAttempts is 3, so 2 delays
      expect(operation).toHaveBeenCalledTimes(3);
      expect(delays).toEqual([1000, 2000]);
    });
  });
});
