import { describe, it, expect } from 'vitest';
import {
  validateTopicDescription,
  validateUseCaseDescription,
} from '../../src/validators/input-validator';

describe('validateTopicDescription', () => {
  it('accepts a valid topic with sufficient non-whitespace characters', () => {
    const result = validateTopicDescription('This is a valid topic description');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts a topic with exactly 10 non-whitespace characters', () => {
    const result = validateTopicDescription('abcdefghij');
    expect(result.valid).toBe(true);
  });

  it('accepts a topic with 10 non-whitespace chars surrounded by whitespace', () => {
    const result = validateTopicDescription('  abc def ghij  ');
    expect(result.valid).toBe(true);
  });

  it('rejects an empty string', () => {
    const result = validateTopicDescription('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      'Topic description requires at least 10 characters of content. Please provide more detail.'
    );
  });

  it('rejects a whitespace-only string', () => {
    const result = validateTopicDescription('     \t\n   ');
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      'Topic description requires at least 10 characters of content. Please provide more detail.'
    );
  });

  it('rejects a string with fewer than 10 non-whitespace characters', () => {
    const result = validateTopicDescription('abc def g');
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      'Topic description requires at least 10 characters of content. Please provide more detail.'
    );
  });

  it('rejects a string exceeding 2000 characters', () => {
    const longString = 'a'.repeat(2001);
    const result = validateTopicDescription(longString);
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      'Topic description exceeds maximum length of 2000 characters.'
    );
  });

  it('accepts a string at exactly 2000 characters', () => {
    const maxString = 'a'.repeat(2000);
    const result = validateTopicDescription(maxString);
    expect(result.valid).toBe(true);
  });

  it('rejects a string with 9 non-whitespace characters', () => {
    const result = validateTopicDescription('abcdefghi');
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      'Topic description requires at least 10 characters of content. Please provide more detail.'
    );
  });

  it('handles strings with mixed whitespace types (tabs, newlines)', () => {
    const result = validateTopicDescription('\t\n ab \t cd \n ef \t gh \n ij');
    expect(result.valid).toBe(true);
  });
});

describe('validateUseCaseDescription', () => {
  it('accepts a valid use case with sufficient non-whitespace characters', () => {
    const result = validateUseCaseDescription('Building a web application');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts a use case with exactly 10 non-whitespace characters', () => {
    const result = validateUseCaseDescription('abcdefghij');
    expect(result.valid).toBe(true);
  });

  it('rejects an empty string', () => {
    const result = validateUseCaseDescription('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      'Use case description requires at least 10 characters of content. Please provide more detail.'
    );
  });

  it('rejects a whitespace-only string', () => {
    const result = validateUseCaseDescription('     \t\n   ');
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      'Use case description requires at least 10 characters of content. Please provide more detail.'
    );
  });

  it('rejects a string with fewer than 10 non-whitespace characters', () => {
    const result = validateUseCaseDescription('short');
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      'Use case description requires at least 10 characters of content. Please provide more detail.'
    );
  });

  it('rejects a string exceeding 1000 characters', () => {
    const longString = 'a'.repeat(1001);
    const result = validateUseCaseDescription(longString);
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      'Use case description exceeds maximum length of 1000 characters.'
    );
  });

  it('accepts a string at exactly 1000 characters', () => {
    const maxString = 'a'.repeat(1000);
    const result = validateUseCaseDescription(maxString);
    expect(result.valid).toBe(true);
  });

  it('rejects a string with 9 non-whitespace characters', () => {
    const result = validateUseCaseDescription('abcdefghi');
    expect(result.valid).toBe(false);
    expect(result.error).toBe(
      'Use case description requires at least 10 characters of content. Please provide more detail.'
    );
  });
});
