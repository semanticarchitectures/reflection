import { PlannedFile, TopicScope, GeneratedFile, CrossReference } from '../models/interfaces.js';

/**
 * Generates markdown content for a single context file based on the content plan.
 *
 * Produces structured markdown with:
 * - An H1 heading identifying the subtopic
 * - Body content of at least 200 characters covering the subtopic
 * - Cross-references as relative markdown links to related files that exist in the context set
 *
 * @param planned - The planned file metadata (subtopic, filename, related files)
 * @param scope - The topic scope providing context for content generation
 * @param existingFiles - Already-generated files available for cross-referencing
 * @returns A GeneratedFile with filename, title, content, and cross-references
 */
export function generateFile(
  planned: PlannedFile,
  scope: TopicScope,
  existingFiles: GeneratedFile[]
): GeneratedFile {
  const title = planned.subtopic;
  const crossReferences = resolveCrossReferences(planned, existingFiles);
  const body = generateBody(planned, scope, crossReferences);
  const content = formatContent(title, body, crossReferences);

  return {
    filename: planned.filename,
    title,
    content,
    crossReferences,
  };
}

/**
 * Resolves which cross-references are valid (target exists in the context set).
 *
 * A cross-reference is valid if:
 * - The target filename exists in the existingFiles array, OR
 * - The target filename is listed in planned.relatedFiles AND exists in existingFiles
 *
 * Per requirement 4.5: if a cross-reference target doesn't exist, it is omitted.
 */
function resolveCrossReferences(
  planned: PlannedFile,
  existingFiles: GeneratedFile[]
): CrossReference[] {
  const existingFilenames = new Set(existingFiles.map((f) => f.filename));
  const references: CrossReference[] = [];

  for (const relatedFilename of planned.relatedFiles) {
    if (existingFilenames.has(relatedFilename)) {
      const targetFile = existingFiles.find((f) => f.filename === relatedFilename);
      if (targetFile) {
        references.push({
          targetFilename: relatedFilename,
          anchorText: `Related: ${targetFile.title}`,
        });
      }
    }
  }

  return references;
}

/**
 * Generates the body content for a context file.
 *
 * Produces template-based structured markdown covering the subtopic with sections:
 * - Introduction
 * - Key Concepts
 * - Relationships (contextual connections to the broader topic)
 *
 * Ensures the body is at least 200 characters long.
 */
function generateBody(
  planned: PlannedFile,
  scope: TopicScope,
  _crossReferences: CrossReference[]
): string {
  const sections: string[] = [];

  // Introduction section
  sections.push(generateIntroduction(planned, scope));

  // Key Concepts section
  sections.push(generateKeyConcepts(planned, scope));

  // Relationships section
  sections.push(generateRelationships(planned, scope));

  const body = sections.join('\n\n');

  // Ensure minimum 200 characters of body content
  return ensureMinimumLength(body, planned, scope);
}

/**
 * Generates the introduction section for the subtopic.
 */
function generateIntroduction(planned: PlannedFile, scope: TopicScope): string {
  const lines: string[] = [];
  lines.push('## Introduction');
  lines.push('');
  lines.push(
    `${planned.subtopic} is a key aspect of ${scope.originalTopic}. ` +
    `${planned.description} ` +
    `This section provides foundational understanding relevant to ${scope.originalUseCase}.`
  );

  return lines.join('\n');
}

/**
 * Generates the key concepts section for the subtopic.
 */
function generateKeyConcepts(planned: PlannedFile, scope: TopicScope): string {
  const lines: string[] = [];
  lines.push('## Key Concepts');
  lines.push('');

  // Generate concept points from refinements and the subtopic itself
  const concepts = deriveConceptsFromScope(planned, scope);
  for (const concept of concepts) {
    lines.push(`- ${concept}`);
  }

  return lines.join('\n');
}

/**
 * Generates the relationships section connecting this subtopic to the broader topic.
 */
function generateRelationships(planned: PlannedFile, scope: TopicScope): string {
  const lines: string[] = [];
  lines.push('## Relationships');
  lines.push('');
  lines.push(
    `${planned.subtopic} connects to the broader context of ${scope.originalTopic} ` +
    `by providing specific knowledge that supports ${scope.originalUseCase}. ` +
    `Understanding this aspect helps build a comprehensive view of the overall topic.`
  );

  return lines.join('\n');
}

/**
 * Derives concept bullet points from the topic scope and planned file metadata.
 */
function deriveConceptsFromScope(planned: PlannedFile, scope: TopicScope): string[] {
  const concepts: string[] = [];

  // Core concept from the subtopic itself
  concepts.push(
    `The fundamentals of ${planned.subtopic.toLowerCase()} and how they apply in practice`
  );

  // Add concepts from refinements if available
  if (scope.refinements.length > 0) {
    const relevantRefinement = scope.refinements[0];
    concepts.push(
      `How ${planned.subtopic.toLowerCase()} relates to ${relevantRefinement!.toLowerCase()}`
    );
  }

  // Add a concept about the use case connection
  concepts.push(
    `Practical considerations for ${planned.subtopic.toLowerCase()} in the context of ${scope.originalUseCase.toLowerCase()}`
  );

  return concepts;
}

/**
 * Ensures the body content meets the minimum 200 character requirement.
 * If the body is too short, appends additional contextual content.
 */
function ensureMinimumLength(body: string, planned: PlannedFile, scope: TopicScope): string {
  const MIN_BODY_LENGTH = 200;

  if (body.length >= MIN_BODY_LENGTH) {
    return body;
  }

  // Append additional content to meet the minimum
  const additionalContent = [
    '',
    '## Additional Context',
    '',
    `${planned.subtopic} plays an important role within the scope of ${scope.originalTopic}. ` +
    `When considering ${scope.originalUseCase}, this subtopic provides essential background ` +
    `knowledge that enables deeper understanding of the subject matter. ` +
    `The concepts covered here form a foundation for exploring related aspects of the topic.`,
  ].join('\n');

  const extended = body + '\n\n' + additionalContent;

  return extended;
}

/**
 * Formats the final markdown content with heading, body, and cross-references.
 */
function formatContent(
  title: string,
  body: string,
  crossReferences: CrossReference[]
): string {
  const parts: string[] = [];

  // H1 heading as the first line
  parts.push(`# ${title}`);
  parts.push('');

  // Body content
  parts.push(body);

  // Cross-references section (only if there are valid references)
  if (crossReferences.length > 0) {
    parts.push('');
    parts.push('## See Also');
    parts.push('');
    for (const ref of crossReferences) {
      parts.push(`- [${ref.anchorText}](./${ref.targetFilename})`);
    }
  }

  return parts.join('\n');
}
