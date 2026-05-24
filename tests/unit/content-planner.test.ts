import { describe, it, expect } from 'vitest';
import { planContextSet } from '../../src/planners/content-planner.js';
import { TopicScope } from '../../src/models/interfaces.js';
import { MIN_FILES, MAX_FILES } from '../../src/models/types.js';

describe('ContentPlanner', () => {
  describe('planContextSet', () => {
    it('should return a ContentPlan with files and estimatedTotal', async () => {
      const scope: TopicScope = {
        originalTopic: 'TypeScript design patterns',
        originalUseCase: 'Learning common patterns for building scalable applications',
        refinements: ['Factory pattern', 'Observer pattern', 'Strategy pattern'],
        summary: 'TypeScript design patterns for scalable applications. Covers creational, structural, and behavioral patterns.',
      };

      const plan = await planContextSet(scope);

      expect(plan).toHaveProperty('files');
      expect(plan).toHaveProperty('estimatedTotal');
      expect(plan.estimatedTotal).toBe(plan.files.length);
    });

    it('should generate between MIN_FILES and MAX_FILES files', async () => {
      const scope: TopicScope = {
        originalTopic: 'Machine learning fundamentals',
        originalUseCase: 'Understanding ML concepts for a data science role',
        refinements: ['Supervised learning', 'Unsupervised learning', 'Neural networks'],
        summary: 'Machine learning fundamentals covering supervised and unsupervised approaches. Neural networks and deep learning basics. Model evaluation and validation techniques.',
      };

      const plan = await planContextSet(scope);

      expect(plan.files.length).toBeGreaterThanOrEqual(MIN_FILES);
      expect(plan.files.length).toBeLessThanOrEqual(MAX_FILES);
    });

    it('should produce unique subtopics (no duplicates)', async () => {
      const scope: TopicScope = {
        originalTopic: 'React hooks',
        originalUseCase: 'Building modern React applications',
        refinements: ['useState hook', 'useEffect hook', 'Custom hooks', 'useState hook'],
        summary: 'React hooks for state management and side effects. Custom hooks for reusable logic.',
      };

      const plan = await planContextSet(scope);
      const subtopics = plan.files.map((f) => f.subtopic.toLowerCase().trim());
      const uniqueSubtopics = new Set(subtopics);

      expect(uniqueSubtopics.size).toBe(subtopics.length);
    });

    it('should produce unique filenames (no duplicates)', async () => {
      const scope: TopicScope = {
        originalTopic: 'API design',
        originalUseCase: 'Designing RESTful APIs',
        refinements: ['REST principles', 'Authentication', 'Error handling', 'Versioning'],
        summary: 'API design best practices. REST principles and HTTP methods. Authentication and authorization. Error handling strategies.',
      };

      const plan = await planContextSet(scope);
      const filenames = plan.files.map((f) => f.filename);
      const uniqueFilenames = new Set(filenames);

      expect(uniqueFilenames.size).toBe(filenames.length);
    });

    it('should generate valid kebab-case filenames ending in .md', async () => {
      const scope: TopicScope = {
        originalTopic: 'Cloud computing services',
        originalUseCase: 'Migrating on-premise infrastructure to the cloud',
        refinements: ['AWS services', 'Azure comparison', 'Cost optimization'],
        summary: 'Cloud computing services overview. AWS and Azure comparison. Cost optimization strategies for cloud migration.',
      };

      const plan = await planContextSet(scope);
      const filenamePattern = /^[a-z0-9]+(-[a-z0-9]+)*\.md$/;

      for (const file of plan.files) {
        expect(file.filename).toMatch(filenamePattern);
        expect(file.filename.length).toBeLessThanOrEqual(60);
      }
    });

    it('should assign cross-reference relationships', async () => {
      const scope: TopicScope = {
        originalTopic: 'Database design',
        originalUseCase: 'Designing efficient database schemas',
        refinements: ['Normalization', 'Indexing', 'Query optimization'],
        summary: 'Database design principles. Normalization forms. Indexing strategies. Query optimization techniques.',
      };

      const plan = await planContextSet(scope);

      // At least some files should have cross-references
      const filesWithRefs = plan.files.filter((f) => f.relatedFiles.length > 0);
      expect(filesWithRefs.length).toBeGreaterThan(0);

      // Cross-references should point to filenames that exist in the plan
      const allFilenames = new Set(plan.files.map((f) => f.filename));
      for (const file of plan.files) {
        for (const ref of file.relatedFiles) {
          expect(allFilenames.has(ref)).toBe(true);
        }
      }
    });

    it('should handle minimal input and still produce at least MIN_FILES', async () => {
      const scope: TopicScope = {
        originalTopic: 'Testing',
        originalUseCase: 'Writing better tests',
        refinements: [],
        summary: 'Software testing',
      };

      const plan = await planContextSet(scope);

      expect(plan.files.length).toBeGreaterThanOrEqual(MIN_FILES);
    });

    it('should include description for each planned file', async () => {
      const scope: TopicScope = {
        originalTopic: 'GraphQL',
        originalUseCase: 'Building a GraphQL API',
        refinements: ['Schema design', 'Resolvers', 'Subscriptions'],
        summary: 'GraphQL API development. Schema design and type system. Resolvers and data fetching. Real-time subscriptions.',
      };

      const plan = await planContextSet(scope);

      for (const file of plan.files) {
        expect(file.description).toBeDefined();
        expect(file.description.length).toBeGreaterThan(0);
      }
    });

    it('should not reference itself in relatedFiles', async () => {
      const scope: TopicScope = {
        originalTopic: 'Microservices architecture',
        originalUseCase: 'Breaking a monolith into microservices',
        refinements: ['Service discovery', 'API gateway', 'Event-driven communication', 'Data consistency', 'Deployment strategies'],
        summary: 'Microservices architecture patterns. Service discovery and communication. API gateway design. Event-driven architecture. Data consistency across services.',
      };

      const plan = await planContextSet(scope);

      for (const file of plan.files) {
        expect(file.relatedFiles).not.toContain(file.filename);
      }
    });
  });
});
