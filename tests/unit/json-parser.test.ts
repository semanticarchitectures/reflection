import { describe, it, expect } from 'vitest';
import { extractJSON, parseAndValidate } from '../../src/llm/json-parser.js';

describe('extractJSON', () => {
  it('extracts raw JSON object', () => {
    const input = '{"key": "value", "num": 42}';
    expect(extractJSON(input)).toBe('{"key": "value", "num": 42}');
  });

  it('extracts raw JSON array', () => {
    const input = '[1, 2, 3]';
    expect(extractJSON(input)).toBe('[1, 2, 3]');
  });

  it('extracts JSON from ```json code fence', () => {
    const input = '```json\n{"key": "value"}\n```';
    expect(extractJSON(input)).toBe('{"key": "value"}');
  });

  it('extracts JSON from ``` code fence without language', () => {
    const input = '```\n{"key": "value"}\n```';
    expect(extractJSON(input)).toBe('{"key": "value"}');
  });

  it('extracts JSON with leading text', () => {
    const input = 'Here is the plan:\n{"key": "value"}';
    expect(extractJSON(input)).toBe('{"key": "value"}');
  });

  it('extracts JSON with trailing text', () => {
    const input = '{"key": "value"}\nLet me know if you need changes.';
    expect(extractJSON(input)).toBe('{"key": "value"}');
  });

  it('extracts JSON with both leading and trailing text', () => {
    const input = 'Sure! Here it is:\n{"key": "value"}\nHope that helps!';
    expect(extractJSON(input)).toBe('{"key": "value"}');
  });

  it('extracts JSON from code fence with leading/trailing text', () => {
    const input = 'Here is the JSON:\n```json\n{"files": [1, 2]}\n```\nLet me know!';
    expect(extractJSON(input)).toBe('{"files": [1, 2]}');
  });

  it('handles nested objects', () => {
    const input = '{"outer": {"inner": "value"}}';
    expect(extractJSON(input)).toBe('{"outer": {"inner": "value"}}');
  });

  it('handles nested arrays', () => {
    const input = '[[1, 2], [3, 4]]';
    expect(extractJSON(input)).toBe('[[1, 2], [3, 4]]');
  });

  it('handles strings containing braces', () => {
    const input = '{"text": "a { b } c"}';
    expect(extractJSON(input)).toBe('{"text": "a { b } c"}');
  });

  it('handles escaped quotes in strings', () => {
    const input = '{"text": "she said \\"hello\\""}';
    expect(extractJSON(input)).toBe('{"text": "she said \\"hello\\""}');
  });

  it('returns null for empty string', () => {
    expect(extractJSON('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(extractJSON('   \n\t  ')).toBeNull();
  });

  it('returns null for text with no JSON', () => {
    expect(extractJSON('This is just plain text without any JSON.')).toBeNull();
  });

  it('returns null for incomplete JSON object', () => {
    expect(extractJSON('{"key": "value"')).toBeNull();
  });

  it('extracts first JSON object when multiple exist', () => {
    const input = '{"first": 1} {"second": 2}';
    expect(extractJSON(input)).toBe('{"first": 1}');
  });
});

describe('parseAndValidate', () => {
  interface TestData {
    name: string;
    count: number;
  }

  const isTestData = (parsed: unknown): parsed is TestData => {
    if (typeof parsed !== 'object' || parsed === null) return false;
    const obj = parsed as Record<string, unknown>;
    return typeof obj['name'] === 'string' && typeof obj['count'] === 'number';
  };

  it('returns success with valid JSON matching validator', () => {
    const input = '{"name": "test", "count": 5}';
    const result = parseAndValidate(input, isTestData, 'test-stage');
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: 'test', count: 5 });
    expect(result.error).toBeUndefined();
    expect(result.rawContent).toBeUndefined();
  });

  it('returns success when JSON is wrapped in code fences', () => {
    const input = '```json\n{"name": "wrapped", "count": 10}\n```';
    const result = parseAndValidate(input, isTestData, 'test-stage');
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: 'wrapped', count: 10 });
  });

  it('returns failure when no JSON found', () => {
    const input = 'No JSON here at all';
    const result = parseAndValidate(input, isTestData, 'planner');
    expect(result.success).toBe(false);
    expect(result.error).toContain('[planner]');
    expect(result.error).toContain('No valid JSON');
    expect(result.rawContent).toBe(input);
  });

  it('returns failure when JSON does not match validator', () => {
    const input = '{"wrong": "structure"}';
    const result = parseAndValidate(input, isTestData, 'generator');
    expect(result.success).toBe(false);
    expect(result.error).toContain('[generator]');
    expect(result.error).toContain('Schema validation failed');
    expect(result.rawContent).toBe(input);
  });

  it('returns failure for invalid JSON syntax', () => {
    const input = '{invalid json content}';
    const result = parseAndValidate(input, isTestData, 'clarifier');
    expect(result.success).toBe(false);
    expect(result.error).toContain('[clarifier]');
    expect(result.error).toContain('JSON parse error');
    expect(result.rawContent).toBe(input);
  });

  it('truncates rawContent to 4000 chars on failure', () => {
    const longContent = 'x'.repeat(5000);
    const result = parseAndValidate(longContent, isTestData, 'test-stage');
    expect(result.success).toBe(false);
    expect(result.rawContent).toHaveLength(4000);
  });

  it('does not truncate rawContent when under 4000 chars', () => {
    const shortContent = 'No JSON here';
    const result = parseAndValidate(shortContent, isTestData, 'test-stage');
    expect(result.success).toBe(false);
    expect(result.rawContent).toBe(shortContent);
  });

  it('includes stage name in error messages', () => {
    const result = parseAndValidate('not json', isTestData, 'my-stage');
    expect(result.error).toContain('[my-stage]');
  });
});
