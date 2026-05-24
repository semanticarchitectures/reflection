import { GeneratedFile } from '../models/interfaces.js';

/**
 * Builds the content for an index.md file that lists and describes all context files
 * in a generated context set.
 *
 * The index provides a navigable table of contents with relative markdown links
 * and brief descriptions for each file in the set.
 *
 * @param files - Array of GeneratedFile objects to include in the index
 * @returns The full index.md content as a string
 */
export function buildIndex(files: GeneratedFile[]): string {
  const lines: string[] = [];

  lines.push('# Index');
  lines.push('');

  for (const file of files) {
    const description = extractDescription(file);
    lines.push(`- [${file.title}](./${file.filename}) — ${description}`);
  }

  return lines.join('\n');
}

/**
 * Extracts a 1–2 sentence description from a GeneratedFile's content.
 *
 * Strategy:
 * 1. Skip the H1 heading line and any blank lines following it
 * 2. Skip section headings (lines starting with ##)
 * 3. Collect the first 1–2 sentences from the body text
 *
 * Falls back to a generic description if no suitable content is found.
 */
function extractDescription(file: GeneratedFile): string {
  const contentLines = file.content.split('\n');

  // Skip the H1 heading and collect body text
  const bodyLines: string[] = [];
  let pastHeading = false;

  for (const line of contentLines) {
    // Skip the H1 heading
    if (!pastHeading) {
      if (line.startsWith('# ')) {
        pastHeading = true;
        continue;
      }
      // If no H1 found yet, skip blank lines at the start
      if (line.trim() === '') {
        continue;
      }
      // Content before any heading — treat as body
      pastHeading = true;
    }

    // Skip blank lines immediately after heading
    if (bodyLines.length === 0 && line.trim() === '') {
      continue;
    }

    // Skip section headings (##, ###, etc.)
    if (line.startsWith('#')) {
      // If we already have body text, stop here
      if (bodyLines.length > 0) {
        break;
      }
      continue;
    }

    // Skip blank lines between sections if we haven't found body text yet
    if (bodyLines.length === 0 && line.trim() === '') {
      continue;
    }

    // Stop at blank lines after we've collected some text
    if (line.trim() === '' && bodyLines.length > 0) {
      break;
    }

    bodyLines.push(line.trim());
  }

  const bodyText = bodyLines.join(' ');

  if (bodyText.length === 0) {
    return `Covers ${file.title.toLowerCase()}.`;
  }

  // Extract 1–2 sentences
  return extractSentences(bodyText, 2);
}

/**
 * Extracts up to `maxSentences` sentences from the given text.
 * A sentence ends with '.', '!', or '?' followed by a space or end of string.
 */
function extractSentences(text: string, maxSentences: number): string {
  const sentenceEndings = /([.!?])\s+/g;
  let count = 0;
  let lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = sentenceEndings.exec(text)) !== null) {
    count++;
    if (count >= maxSentences) {
      lastIndex = match.index + match[1]!.length;
      break;
    }
  }

  if (lastIndex > 0) {
    return text.slice(0, lastIndex).trim();
  }

  // If no sentence boundary found, check if text ends with punctuation
  if (/[.!?]$/.test(text)) {
    return text.trim();
  }

  // Truncate to a reasonable length and add a period
  const maxLength = 150;
  if (text.length > maxLength) {
    // Try to break at a word boundary
    const truncated = text.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.5) {
      return truncated.slice(0, lastSpace) + '.';
    }
    return truncated + '.';
  }

  return text.endsWith('.') ? text : text + '.';
}
