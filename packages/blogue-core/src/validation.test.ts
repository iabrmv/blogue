import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, rmSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import { validatePost, validateFrontmatter, validateContent, validateQuick } from './validation.js';

const TEST_DIR = 'validation-test-output';

describe('validation', () => {
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

  describe('validateFrontmatter', () => {
    it('should pass with valid frontmatter', () => {
      const frontmatter = {
        title: 'Valid Post',
        date: '2025-01-15',
        author: 'Test Author',
        description: 'A valid description',
        tags: ['javascript', 'web'],
        draft: true
      };

      const result = validateFrontmatter(frontmatter);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail with missing title', () => {
      const frontmatter = {
        date: '2025-01-15',
        draft: true
      };

      const result = validateFrontmatter(frontmatter);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Title is required and must be a non-empty string');
    });

    it('should fail with empty title', () => {
      const frontmatter = {
        title: '',
        date: '2025-01-15'
      };

      const result = validateFrontmatter(frontmatter);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Title is required and must be a non-empty string');
    });

    it('should fail with invalid date format', () => {
      const frontmatter = {
        title: 'Test Post',
        date: 'invalid-date'
      };

      const result = validateFrontmatter(frontmatter);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Date must be in YYYY-MM-DD format');
    });

    it('should fail with invalid date value', () => {
      const frontmatter = {
        title: 'Test Post',
        date: '2025-13-50' // Invalid month and day
      };

      const result = validateFrontmatter(frontmatter);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Date must be a valid date');
    });

    it('should fail with non-array tags', () => {
      const frontmatter = {
        title: 'Test Post',
        tags: 'not-an-array'
      };

      const result = validateFrontmatter(frontmatter);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Tags must be an array');
    });

    it('should fail with non-string tags', () => {
      const frontmatter = {
        title: 'Test Post',
        tags: ['valid', 123, 'also-valid']
      };

      const result = validateFrontmatter(frontmatter);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('All tags must be strings');
    });

    it('should fail with non-boolean draft', () => {
      const frontmatter = {
        title: 'Test Post',
        draft: 'true'
      };

      const result = validateFrontmatter(frontmatter);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Draft must be a boolean value');
    });

    it('should warn about long title', () => {
      const frontmatter = {
        title: 'This is a very long title that exceeds one hundred characters and should trigger a warning about being too long for practical use',
        date: '2025-01-15'
      };

      const result = validateFrontmatter(frontmatter);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Title is very long (>100 characters), consider shortening');
    });

    it('should warn about non-string author', () => {
      const frontmatter = {
        title: 'Test Post',
        author: 123
      };

      const result = validateFrontmatter(frontmatter);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Author should be a string');
    });

    it('should warn about non-string description', () => {
      const frontmatter = {
        title: 'Test Post',
        description: ['not', 'a', 'string']
      };

      const result = validateFrontmatter(frontmatter);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Description should be a string');
    });
  });

  describe('validateContent', () => {
    it('should pass with good content', () => {
      const content = `# My Post

This is a good blog post with enough content to be meaningful.
It has headings and substantial text.

## Another Section

More content here.`;

      const result = validateContent(content);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should warn about empty content', () => {
      const result = validateContent('');
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Post content is empty');
    });

    it('should warn about placeholder content', () => {
      const content = `# Test Post

Write your blog post content here...`;

      const result = validateContent(content);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Post still contains placeholder content');
    });

    it('should warn about very short content', () => {
      const content = 'Short';

      const result = validateContent(content);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Post content is very short (<50 characters)');
    });

    it('should warn about no headings', () => {
      const content = 'This is a post without any headings, just plain text content that goes on for a while.';

      const result = validateContent(content);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Post has no headings, consider adding structure');
    });
  });

  describe('validatePost', () => {
    it('should validate a complete valid post file', () => {
      const frontmatter = {
        title: 'Valid Post',
        date: '2025-01-15',
        author: 'Test Author',
        tags: ['test'],
        draft: true
      };

      const content = `# Valid Post

This is a well-structured blog post with good content.

## Introduction

The post has headings and substantial content.`;

      const postContent = matter.stringify(content, frontmatter);
      const filePath = join(TEST_DIR, 'valid-post.md');
      writeFileSync(filePath, postContent);

      const result = validatePost(filePath);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail for non-existent file', () => {
      const result = validatePost('non-existent.md');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File not found: non-existent.md');
    });

    it('should fail for file with invalid frontmatter', () => {
      const content = `---
title: 
date: invalid
---
# Content`;

      const filePath = join(TEST_DIR, 'invalid-frontmatter.md');
      writeFileSync(filePath, content);

      const result = validatePost(filePath);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle malformed markdown gracefully', () => {
      const content = `---
title: Test
broken yaml: [unclosed
---
Content`;

      const filePath = join(TEST_DIR, 'malformed.md');
      writeFileSync(filePath, content);

      const result = validatePost(filePath);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Failed to parse markdown file'))).toBe(true);
    });

    it('should combine frontmatter and content validation', () => {
      const frontmatter = {
        title: 'Test Post',
        date: '2025-01-15',
        tags: ['test']
      };

      const content = 'Write your blog post content here...'; // Placeholder content

      const postContent = matter.stringify(content, frontmatter);
      const filePath = join(TEST_DIR, 'with-warnings.md');
      writeFileSync(filePath, postContent);

      const result = validatePost(filePath);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Post still contains placeholder content');
    });
  });

  describe('validateQuick', () => {
    it('should pass quick validation with minimal valid post', () => {
      const frontmatter = { title: 'Quick Test' };
      const content = matter.stringify('Some content', frontmatter);
      const filePath = join(TEST_DIR, 'quick-test.md');
      writeFileSync(filePath, content);

      const result = validateQuick(filePath);
      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail quick validation with missing title', () => {
      const frontmatter = { date: '2025-01-15' };
      const content = matter.stringify('Some content', frontmatter);
      const filePath = join(TEST_DIR, 'no-title.md');
      writeFileSync(filePath, content);

      const result = validateQuick(filePath);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Title is required');
    });

    it('should fail for non-existent file', () => {
      const result = validateQuick('non-existent.md');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('File not found: non-existent.md');
    });

    it('should handle parse errors gracefully', () => {
      const content = `---
malformed: yaml: content [
---
Content`;

      const filePath = join(TEST_DIR, 'parse-error.md');
      writeFileSync(filePath, content);

      const result = validateQuick(filePath);
      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Failed to parse file'))).toBe(true);
    });
  });
});