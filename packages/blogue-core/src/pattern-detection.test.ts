import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, rmSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import { detectFrontmatterPattern, validateAgainstPattern } from './pattern-detection.js';

const TEST_DIR = 'pattern-test-output';

describe('pattern-detection', () => {
  beforeEach(() => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    // Clean up after tests
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('detectFrontmatterPattern', () => {
    it('should detect pattern from consistent posts', () => {
      // Create test posts with consistent pattern
      const posts = [
        { title: 'Post 1', publishedAt: '2025-01-01', author: 'John', tags: ['tech'], draft: false },
        { title: 'Post 2', publishedAt: '2025-01-02', author: 'Jane', tags: ['web'], draft: true },
        { title: 'Post 3', publishedAt: '2025-01-03', author: 'Bob', tags: ['js'], draft: false }
      ];

      posts.forEach((frontmatter, i) => {
        const content = matter.stringify(`# ${frontmatter.title}`, frontmatter);
        writeFileSync(join(TEST_DIR, `post-${i}.md`), content);
      });

      const result = detectFrontmatterPattern(TEST_DIR);

      expect(result.success).toBe(true);
      expect(result.pattern).toBeTruthy();
      expect(result.pattern!.requiredFields).toContain('title');
      expect(result.pattern!.requiredFields).toContain('publishedAt');
      expect(result.pattern!.requiredFields).toContain('author');
      expect(result.pattern!.confidence).toBeGreaterThan(0.8);
    });

    it('should handle mixed patterns and find common fields', () => {
      const posts = [
        { title: 'Post 1', date: '2025-01-01', author: 'John', tags: ['tech'] },
        { title: 'Post 2', date: '2025-01-02', category: 'tech' }, // Different fields
        { title: 'Post 3', date: '2025-01-03', author: 'Bob', description: 'A post' }
      ];

      posts.forEach((frontmatter, i) => {
        const content = matter.stringify(`# ${frontmatter.title}`, frontmatter);
        writeFileSync(join(TEST_DIR, `post-${i}.md`), content);
      });

      const result = detectFrontmatterPattern(TEST_DIR);

      expect(result.success).toBe(true);
      expect(result.pattern!.requiredFields).toContain('title'); // 100% frequency
      expect(result.pattern!.requiredFields).toContain('date'); // 100% frequency
      expect(result.pattern!.optionalFields).toContain('author'); // 67% frequency
    });

    it('should return failure for non-existent directory', () => {
      const result = detectFrontmatterPattern('non-existent-dir');
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Directory not found');
      expect(result.pattern).toBeNull();
    });

    it('should return failure for directory with no markdown files', () => {
      const result = detectFrontmatterPattern(TEST_DIR);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('No markdown files found');
      expect(result.pattern).toBeNull();
    });

    it('should handle malformed markdown files gracefully', () => {
      // Create valid post
      const validPost = { title: 'Valid Post', date: '2025-01-01' };
      const validContent = matter.stringify('# Valid Post', validPost);
      writeFileSync(join(TEST_DIR, 'valid.md'), validContent);

      // Create malformed post
      writeFileSync(join(TEST_DIR, 'malformed.md'), `---
title: Broken
malformed: yaml: [unclosed
---
Content`);

      const result = detectFrontmatterPattern(TEST_DIR);

      expect(result.success).toBe(true); // Should still work with valid posts
      expect(result.pattern!.totalPosts).toBe(1); // Only valid post counted
    });

    it('should detect Astro-style publishedAt fields', () => {
      const posts = [
        { title: 'Post 1', publishedAt: '2025-01-01T10:00:00Z', updatedAt: '2025-01-02T10:00:00Z' },
        { title: 'Post 2', publishedAt: '2025-01-02T10:00:00Z', updatedAt: '2025-01-03T10:00:00Z' }
      ];

      posts.forEach((frontmatter, i) => {
        const content = matter.stringify(`# ${frontmatter.title}`, frontmatter);
        writeFileSync(join(TEST_DIR, `post-${i}.md`), content);
      });

      const result = detectFrontmatterPattern(TEST_DIR);

      expect(result.success).toBe(true);
      expect(result.suggestedTemplate).toHaveProperty('publishedAt');
      expect(result.suggestedTemplate).toHaveProperty('updatedAt');
    });

    it('should detect Hugo-style publishDate fields', () => {
      const posts = [
        { title: 'Post 1', publishDate: '2025-01-01', lastmod: '2025-01-02', categories: ['tech'] },
        { title: 'Post 2', publishDate: '2025-01-02', lastmod: '2025-01-03', categories: ['web'] }
      ];

      posts.forEach((frontmatter, i) => {
        const content = matter.stringify(`# ${frontmatter.title}`, frontmatter);
        writeFileSync(join(TEST_DIR, `post-${i}.md`), content);
      });

      const result = detectFrontmatterPattern(TEST_DIR);

      expect(result.success).toBe(true);
      expect(result.suggestedTemplate).toHaveProperty('publishDate');
      expect(result.suggestedTemplate).toHaveProperty('categories');
    });

    it('should generate appropriate default values', () => {
      const posts = [
        { title: 'Post 1', draft: true, tags: ['tech'], featured: false, priority: 1 },
        { title: 'Post 2', draft: false, tags: ['web'], featured: true, priority: 2 }
      ];

      posts.forEach((frontmatter, i) => {
        const content = matter.stringify(`# ${frontmatter.title}`, frontmatter);
        writeFileSync(join(TEST_DIR, `post-${i}.md`), content);
      });

      const result = detectFrontmatterPattern(TEST_DIR);

      expect(result.success).toBe(true);
      expect(result.suggestedTemplate!.draft).toBe(true); // Boolean default
      expect(result.suggestedTemplate!.tags).toEqual([]); // Array default
      expect(result.suggestedTemplate!.featured).toBe(false); // Boolean default
      expect(result.suggestedTemplate!.priority).toBe(0); // Number default
    });

    it('should have higher confidence with more consistent data', () => {
      // Create highly consistent posts
      const consistentPosts = [
        { title: 'Post 1', date: '2025-01-01', author: 'John', tags: ['tech'], draft: false },
        { title: 'Post 2', date: '2025-01-02', author: 'Jane', tags: ['web'], draft: true },
        { title: 'Post 3', date: '2025-01-03', author: 'Bob', tags: ['js'], draft: false },
        { title: 'Post 4', date: '2025-01-04', author: 'Alice', tags: ['css'], draft: true },
        { title: 'Post 5', date: '2025-01-05', author: 'Charlie', tags: ['html'], draft: false }
      ];

      consistentPosts.forEach((frontmatter, i) => {
        const content = matter.stringify(`# ${frontmatter.title}`, frontmatter);
        writeFileSync(join(TEST_DIR, `consistent-${i}.md`), content);
      });

      const consistentResult = detectFrontmatterPattern(TEST_DIR);

      // Create inconsistent posts
      rmSync(TEST_DIR, { recursive: true, force: true });
      mkdirSync(TEST_DIR, { recursive: true });

      const inconsistentPosts = [
        { title: 'Post 1', date: '2025-01-01' },
        { name: 'Post 2', publishedAt: '2025-01-02', category: 'tech' }, // Different structure
      ];

      inconsistentPosts.forEach((frontmatter, i) => {
        const content = matter.stringify('# Content', frontmatter);
        writeFileSync(join(TEST_DIR, `inconsistent-${i}.md`), content);
      });

      const inconsistentResult = detectFrontmatterPattern(TEST_DIR);

      expect(consistentResult.pattern!.confidence).toBeGreaterThan(inconsistentResult.pattern!.confidence);
    });
  });

  describe('validateAgainstPattern', () => {
    it('should validate template against pattern successfully', () => {
      const pattern = {
        commonFields: [
          { fieldName: 'title', frequency: 1, types: ['string'], examples: ['Test'] },
          { fieldName: 'date', frequency: 1, types: ['string'], examples: ['2025-01-01'] }
        ],
        requiredFields: ['title', 'date'],
        optionalFields: [],
        rareFields: [],
        totalPosts: 2,
        confidence: 0.9
      };

      const template = { title: 'Test Post', date: '2025-01-01' };

      const result = validateAgainstPattern(template, pattern);

      expect(result.isValid).toBe(true);
      expect(result.missingFields).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should detect missing required fields', () => {
      const pattern = {
        commonFields: [],
        requiredFields: ['title', 'publishedAt'],
        optionalFields: [],
        rareFields: [],
        totalPosts: 2,
        confidence: 0.9
      };

      const template = { title: 'Test Post' }; // Missing publishedAt

      const result = validateAgainstPattern(template, pattern);

      expect(result.isValid).toBe(false);
      expect(result.missingFields).toContain('publishedAt');
    });

    it('should warn about type mismatches', () => {
      const pattern = {
        commonFields: [
          { fieldName: 'tags', frequency: 1, types: ['array'], examples: [['tech']] },
          { fieldName: 'draft', frequency: 1, types: ['boolean'], examples: [true] }
        ],
        requiredFields: ['tags', 'draft'],
        optionalFields: [],
        rareFields: [],
        totalPosts: 2,
        confidence: 0.9
      };

      const template = { tags: 'tech', draft: 'true' }; // Wrong types

      const result = validateAgainstPattern(template, pattern);

      expect(result.isValid).toBe(true); // Still valid, just warnings
      expect(result.warnings).toContain("Field 'tags' type 'string' differs from expected 'array'");
      expect(result.warnings).toContain("Field 'draft' type 'string' differs from expected 'boolean'");
    });
  });
});