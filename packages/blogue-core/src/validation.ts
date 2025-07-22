import { existsSync, readFileSync } from 'fs';
import matter from 'gray-matter';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates a markdown post file before publishing
 */
export function validatePost(filePath: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check file existence
  if (!existsSync(filePath)) {
    errors.push(`File not found: ${filePath}`);
    return { isValid: false, errors, warnings };
  }

  try {
    const fileContent = readFileSync(filePath, 'utf8');
    const parsed = matter(fileContent);

    // Validate frontmatter
    const frontmatterResult = validateFrontmatter(parsed.data);
    errors.push(...frontmatterResult.errors);
    warnings.push(...frontmatterResult.warnings);

    // Validate content
    const contentResult = validateContent(parsed.content);
    errors.push(...contentResult.errors);
    warnings.push(...contentResult.warnings);

  } catch (error) {
    errors.push(`Failed to parse markdown file: ${error}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validates frontmatter data
 */
export function validateFrontmatter(frontmatter: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!frontmatter.title || typeof frontmatter.title !== 'string' || frontmatter.title.trim() === '') {
    errors.push('Title is required and must be a non-empty string');
  }

  // Date validation
  if (frontmatter.date) {
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (typeof frontmatter.date !== 'string' || !dateRegex.test(frontmatter.date)) {
      errors.push('Date must be in YYYY-MM-DD format');
    } else {
      const parsedDate = new Date(frontmatter.date);
      if (isNaN(parsedDate.getTime())) {
        errors.push('Date must be a valid date');
      }
    }
  }

  // Tags validation
  if (frontmatter.tags !== undefined) {
    if (!Array.isArray(frontmatter.tags)) {
      errors.push('Tags must be an array');
    } else {
      const invalidTags = frontmatter.tags.filter((tag: any) => typeof tag !== 'string');
      if (invalidTags.length > 0) {
        errors.push('All tags must be strings');
      }
    }
  }

  // Draft validation
  if (frontmatter.draft !== undefined && typeof frontmatter.draft !== 'boolean') {
    errors.push('Draft must be a boolean value');
  }

  // Author validation
  if (frontmatter.author !== undefined && typeof frontmatter.author !== 'string') {
    warnings.push('Author should be a string');
  }

  // Description validation
  if (frontmatter.description !== undefined && typeof frontmatter.description !== 'string') {
    warnings.push('Description should be a string');
  }

  // Warn about long titles
  if (frontmatter.title && frontmatter.title.length > 100) {
    warnings.push('Title is very long (>100 characters), consider shortening');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validates markdown content
 */
export function validateContent(content: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check if content is empty
  if (!content || content.trim() === '') {
    warnings.push('Post content is empty');
    return { isValid: true, errors, warnings };
  }

  // Check for placeholder content
  if (content.includes('Write your blog post content here...')) {
    warnings.push('Post still contains placeholder content');
  }

  // Check for very short content
  if (content.trim().length < 50) {
    warnings.push('Post content is very short (<50 characters)');
  }

  // Check for basic markdown structure
  const hasHeadings = /^#+\s/.test(content);
  if (!hasHeadings) {
    warnings.push('Post has no headings, consider adding structure');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Quick validation that only checks for critical errors
 */
export function validateQuick(filePath: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!existsSync(filePath)) {
    errors.push(`File not found: ${filePath}`);
    return { isValid: false, errors, warnings };
  }

  try {
    const fileContent = readFileSync(filePath, 'utf8');
    const parsed = matter(fileContent);

    // Only check critical fields
    if (!parsed.data.title || parsed.data.title.trim() === '') {
      errors.push('Title is required');
    }

  } catch (error) {
    errors.push(`Failed to parse file: ${error}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}