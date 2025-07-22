/**
 * Pattern Detection - Analyzes existing markdown files to learn frontmatter patterns
 * 
 * ESLint: Dynamic frontmatter analysis requires 'any' for unknown object shapes
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, extname } from 'path';
import matter from 'gray-matter';

export interface FieldPattern {
  fieldName: string;
  frequency: number; // How often this field appears (0-1)
  types: string[]; // Types observed for this field
  examples: any[]; // Sample values
}

export interface FrontmatterPattern {
  commonFields: FieldPattern[];
  requiredFields: string[]; // Fields present in >80% of posts
  optionalFields: string[]; // Fields present in 20-80% of posts
  rareFields: string[]; // Fields present in <20% of posts
  totalPosts: number;
  confidence: number; // How confident we are in this pattern (0-1)
}

export interface DetectionResult {
  pattern: FrontmatterPattern | null;
  success: boolean;
  message: string;
  suggestedTemplate: Record<string, any> | null;
}

/**
 * Analyzes existing markdown posts to detect frontmatter patterns
 */
export function detectFrontmatterPattern(contentDir: string, maxPosts = 10): DetectionResult {
  if (!existsSync(contentDir)) {
    return {
      pattern: null,
      success: false,
      message: `Directory not found: ${contentDir}`,
      suggestedTemplate: null
    };
  }

  // Find markdown files
  const markdownFiles = readdirSync(contentDir)
    .filter(file => extname(file) === '.md')
    .map(file => join(contentDir, file))
    .slice(0, maxPosts); // Limit analysis to recent posts

  if (markdownFiles.length === 0) {
    return {
      pattern: null,
      success: false,
      message: 'No markdown files found to analyze',
      suggestedTemplate: null
    };
  }

  // Analyze frontmatter from each file
  const frontmatterSamples: Record<string, any>[] = [];
  
  for (const filePath of markdownFiles) {
    try {
      const content = readFileSync(filePath, 'utf8');
      const parsed = matter(content);
      if (parsed.data && Object.keys(parsed.data).length > 0) {
        frontmatterSamples.push(parsed.data);
      }
    } catch {
      // Skip malformed files
      continue;
    }
  }

  if (frontmatterSamples.length === 0) {
    return {
      pattern: null,
      success: false,
      message: 'No valid frontmatter found in existing posts',
      suggestedTemplate: null
    };
  }

  // Analyze patterns
  const pattern = analyzeFrontmatterPatterns(frontmatterSamples);
  const template = generateTemplate(pattern);
  
  return {
    pattern,
    success: true,
    message: `Analyzed ${frontmatterSamples.length} posts, confidence: ${Math.round(pattern.confidence * 100)}%`,
    suggestedTemplate: template
  };
}

/**
 * Analyzes frontmatter samples to extract patterns
 */
function analyzeFrontmatterPatterns(samples: Record<string, any>[]): FrontmatterPattern {
  const totalPosts = samples.length;
  const fieldFrequency = new Map<string, FieldPattern>();

  // Count field occurrences and collect examples
  for (const sample of samples) {
    for (const [fieldName, value] of Object.entries(sample)) {
      if (!fieldFrequency.has(fieldName)) {
        fieldFrequency.set(fieldName, {
          fieldName,
          frequency: 0,
          types: [],
          examples: []
        });
      }
      
      const pattern = fieldFrequency.get(fieldName)!;
      pattern.frequency += 1;
      
      const valueType = Array.isArray(value) ? 'array' : typeof value;
      if (!pattern.types.includes(valueType)) {
        pattern.types.push(valueType);
      }
      
      if (pattern.examples.length < 3 && !pattern.examples.includes(value)) {
        pattern.examples.push(value);
      }
    }
  }

  // Calculate frequencies as percentages
  for (const pattern of fieldFrequency.values()) {
    pattern.frequency = pattern.frequency / totalPosts;
  }

  // Categorize fields by frequency
  const commonFields = Array.from(fieldFrequency.values());
  const requiredFields: string[] = [];
  const optionalFields: string[] = [];
  const rareFields: string[] = [];

  for (const field of commonFields) {
    if (field.frequency >= 0.8) {
      requiredFields.push(field.fieldName);
    } else if (field.frequency >= 0.2) {
      optionalFields.push(field.fieldName);
    } else {
      rareFields.push(field.fieldName);
    }
  }

  // Calculate confidence based on consistency
  const confidence = calculateConfidence(commonFields, totalPosts);

  return {
    commonFields,
    requiredFields,
    optionalFields,
    rareFields,
    totalPosts,
    confidence
  };
}

/**
 * Calculates confidence level in the detected pattern
 */
function calculateConfidence(fields: FieldPattern[], totalPosts: number): number {
  if (totalPosts < 2) return 0.5; // Low confidence with few samples
  
  // Higher confidence if we have consistent required fields
  const requiredFieldCount = fields.filter(f => f.frequency >= 0.8).length;
  const hasTitle = fields.some(f => f.fieldName === 'title' && f.frequency >= 0.8);
  const hasDate = fields.some(f => 
    (f.fieldName === 'date' || f.fieldName === 'publishedAt' || f.fieldName === 'publishDate') 
    && f.frequency >= 0.8
  );
  
  let confidence = 0.6; // Base confidence
  
  if (hasTitle) confidence += 0.2;
  if (hasDate) confidence += 0.2;
  if (requiredFieldCount >= 3) confidence += 0.1;
  if (totalPosts >= 5) confidence += 0.1;
  
  return Math.min(confidence, 1.0);
}

/**
 * Determines if a field should be skipped due to being problematic
 */
function shouldSkipField(fieldName: string, fieldPattern: FieldPattern): boolean {
  // Skip object fields where all examples are empty objects
  if (fieldPattern.types.includes('object')) {
    const allExamplesAreEmpty = fieldPattern.examples.every(example => 
      typeof example === 'object' && 
      example !== null && 
      Object.keys(example).length === 0
    );
    
    if (allExamplesAreEmpty) {
      console.log(`🔧 Skipping field '${fieldName}' - all examples are empty objects`);
      return true;
    }
  }
  
  return false;
}

/**
 * Generates a template based on detected patterns
 */
function generateTemplate(pattern: FrontmatterPattern): Record<string, any> {
  const template: Record<string, any> = {};
  
  // Add required fields with appropriate defaults
  for (const fieldName of pattern.requiredFields) {
    const fieldPattern = pattern.commonFields.find(f => f.fieldName === fieldName);
    if (!fieldPattern) continue;
    
    // Skip problematic object fields that are always empty
    if (shouldSkipField(fieldName, fieldPattern)) {
      continue;
    }
    
    template[fieldName] = getDefaultValueForField(fieldName, fieldPattern);
  }
  
  // Add common optional fields
  for (const fieldName of pattern.optionalFields) {
    const fieldPattern = pattern.commonFields.find(f => f.fieldName === fieldName);
    if (!fieldPattern) continue;
    
    // Skip problematic object fields that are always empty
    if (shouldSkipField(fieldName, fieldPattern)) {
      continue;
    }
    
    template[fieldName] = getDefaultValueForField(fieldName, fieldPattern);
  }
  
  return template;
}

/**
 * Gets appropriate default value for a field based on its pattern
 */
function getDefaultValueForField(fieldName: string, pattern: FieldPattern): any {
  const primaryType = pattern.types[0];
  
  // Handle special field names
  switch (fieldName.toLowerCase()) {
    case 'title':
      return ''; // Will be filled by user input
    case 'date':
    case 'publishedat':
    case 'publishdate':
    case 'created':
    case 'updatedat':
    case 'modified':
    case 'lastmod':
      // Detect existing date format from examples
      return getDateValueMatchingPattern(pattern);
    case 'draft':
      return true;
    case 'tags':
    case 'categories':
      return [];
    case 'author':
    case 'description':
      return '';
    case 'published':
      return false;
    default:
      // Use type-based defaults
      switch (primaryType) {
        case 'boolean': return false;
        case 'number': return 0;
        case 'array': return [];
        case 'object': return {};
        default: return '';
      }
  }
}

/**
 * Determines the appropriate date format based on existing pattern examples
 */
function getDateValueMatchingPattern(pattern: FieldPattern): Date | string {
  const hasStringDates = pattern.examples.some(ex => typeof ex === 'string');
  const hasDateObjects = pattern.examples.some(ex => ex instanceof Date);
  
  // If we have string examples, analyze their format
  if (hasStringDates && !hasDateObjects) {
    const stringExamples = pattern.examples.filter(ex => typeof ex === 'string');
    
    // Check if examples are simple date strings (YYYY-MM-DD format)
    const isSimpleDateFormat = stringExamples.some(ex => /^\d{4}-\d{2}-\d{2}$/.test(ex));
    
    if (isSimpleDateFormat) {
      // Return simple date string to match existing format
      return new Date().toISOString().split('T')[0]; // "2025-07-20"
    } else {
      // Return ISO string for complex date formats
      return new Date().toISOString(); // "2025-07-20T10:00:00.000Z"
    }
  } else if (hasDateObjects && !hasStringDates) {
    // Existing posts use Date objects, return Date object for unquoted serialization
    return new Date();
  } else {
    // Mixed formats or no examples - prefer Date object for framework compatibility
    return new Date();
  }
}

/**
 * Validates if a template matches the detected pattern requirements
 */
export function validateAgainstPattern(template: Record<string, any>, pattern: FrontmatterPattern): {
  isValid: boolean;
  missingFields: string[];
  warnings: string[];
} {
  const missingFields: string[] = [];
  const warnings: string[] = [];
  
  // Check for required fields
  for (const requiredField of pattern.requiredFields) {
    if (!(requiredField in template)) {
      missingFields.push(requiredField);
    }
  }
  
  // Check for type mismatches
  for (const [fieldName, value] of Object.entries(template)) {
    const fieldPattern = pattern.commonFields.find(f => f.fieldName === fieldName);
    if (fieldPattern) {
      const valueType = Array.isArray(value) ? 'array' : typeof value;
      if (!fieldPattern.types.includes(valueType)) {
        warnings.push(`Field '${fieldName}' type '${valueType}' differs from expected '${fieldPattern.types[0]}'`);
      }
    }
  }
  
  return {
    isValid: missingFields.length === 0,
    missingFields,
    warnings
  };
}