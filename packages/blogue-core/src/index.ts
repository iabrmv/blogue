import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import slugify from 'slugify';
import matter from 'gray-matter';
import { detectFrontmatterPattern, DetectionResult } from './pattern-detection.js';
import { detectFramework, FrameworkDetectionResult } from './framework-detection.js';

export interface PostOptions {
  title: string;
  contentDir?: string;
  author?: string;
  tags?: string[];
  description?: string;
  draft?: boolean;
  interactive?: boolean; // Whether to prompt for missing required fields
  collectionName?: string; // For Astro: which collection to use
}

export interface PublishOptions {
  filePath: string;
  publishDate?: Date;
}

export interface PostMeta {
  title: string;
  date: string;
  author: string;
  description: string;
  tags: string[];
  draft: boolean;
  slug: string;
  [key: string]: any; // Allow additional properties
}

/**
 * Creates a new blog post with frontmatter, using pattern detection
 */
export async function createPost(options: PostOptions): Promise<string> {
  const {
    title,
    author = '',
    tags = [],
    description = '',
    draft = true
  } = options;
  
  let contentDir = options.contentDir ?? 'src/content/blog';

  const slug = slugify(title, { lower: true, strict: true });
  const currentDate = new Date(); // Keep as Date object for proper YAML serialization
  
  // Try to detect existing patterns first
  const detection = detectFrontmatterPattern(contentDir);
  
  let frontmatter: Record<string, any>;
  
  // Determine preferred date format from pattern detection
  let preferredDateFormat: 'string' | 'date' | undefined = undefined;
  if (detection.success && detection.pattern) {
    const dateFields = detection.pattern.commonFields.filter(f => 
      ['date', 'publishedat', 'publishdate', 'created', 'updatedat', 'modified', 'lastmod'].includes(f.fieldName.toLowerCase())
    );
    
    if (dateFields.length > 0) {
      const hasStringDates = dateFields.some(field => 
        field.examples.some(ex => typeof ex === 'string')
      );
      const hasDateObjects = dateFields.some(field => 
        field.examples.some(ex => ex instanceof Date)
      );
      
      if (hasStringDates && !hasDateObjects) {
        preferredDateFormat = 'string';
      } else if (hasDateObjects && !hasStringDates) {
        preferredDateFormat = 'date';
      }
    }
  }
  
  // Validate if pattern detection template is compatible with framework schema
  const frameworkDetection = await detectFramework(process.cwd(), preferredDateFormat);
  const useFrameworkInstead = shouldPreferFrameworkOverPattern(detection, frameworkDetection);
  
  if (detection.success && detection.suggestedTemplate && !useFrameworkInstead) {
    // Use detected pattern as base
    frontmatter = { ...detection.suggestedTemplate };
    
    // Override with user-provided values
    frontmatter.title = title;
    if (author) frontmatter.author = author;
    if (tags.length > 0) frontmatter.tags = tags;
    if (description) frontmatter.description = description;
    
    // Set draft status
    if ('draft' in frontmatter) {
      frontmatter.draft = draft;
    } else if ('published' in frontmatter) {
      frontmatter.published = !draft;
    }
    
    // Handle date fields - preserve Date objects for proper YAML serialization
    if ('date' in frontmatter) {
      frontmatter.date = currentDate;
    } else if ('publishedAt' in frontmatter) {
      frontmatter.publishedAt = currentDate;
    } else if ('publishDate' in frontmatter) {
      frontmatter.publishDate = currentDate;
    }
  } else {
    // Use framework detection (either as fallback or preferred over broken patterns)
    if (frameworkDetection.primary && frameworkDetection.suggestedTemplate) {
      // Check for Astro collections and use specific collection if requested
      if (frameworkDetection.primary.name === 'Astro' && 
          frameworkDetection.astroCollections && 
          options.collectionName) {
        
        const selectedCollection = frameworkDetection.astroCollections.find(
          c => c.name === options.collectionName
        );
        
        if (selectedCollection) {
          // Use the specific collection's template and directory
          const { astroSchemaAnalyzer } = await import('./astro-schema-analyzer.js');
          frontmatter = astroSchemaAnalyzer.generateTemplate(selectedCollection);
          contentDir = selectedCollection.defaultDir;
        } else {
          // Fallback to default template
          frontmatter = { ...frameworkDetection.suggestedTemplate };
        }
      } else {
        // Use framework-based template
        frontmatter = { ...frameworkDetection.suggestedTemplate };
      }
      
      // Override with user-provided values
      frontmatter.title = title;
      if (author) frontmatter.author = author;
      if (tags.length > 0) frontmatter.tags = tags;
      if (description) frontmatter.description = description;
      
      // Set draft status based on framework
      const config = frameworkDetection.primary.contentConfig!;
      if (config.draftField && config.draftField in frontmatter) {
        frontmatter[config.draftField] = draft;
      } else if (config.publishedField && config.publishedField in frontmatter) {
        frontmatter[config.publishedField] = !draft;
      }
      
      // Set date field based on framework - preserve Date objects
      if (config.dateField in frontmatter) {
        frontmatter[config.dateField] = currentDate;
      }
    } else {
      // Fall back to default structure
      frontmatter = {
        title,
        date: currentDate,
        author,
        description,
        tags,
        draft
      };
    }
  }

  const content = matter.stringify(`# ${title}\n\nWrite your blog post content here...`, frontmatter);
  
  // Ensure directory exists
  if (!existsSync(contentDir)) {
    mkdirSync(contentDir, { recursive: true });
  }

  const filePath = join(contentDir, `${slug}.md`);
  writeFileSync(filePath, content);
  
  return filePath;
}

/**
 * Publishes a blog post by setting draft: false and optionally updating the date
 */
export function publishPost(options: PublishOptions): void {
  const { filePath, publishDate } = options;
  
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const fileContent = readFileSync(filePath, 'utf8');
  const parsed = matter(fileContent);
  
  // Update frontmatter
  parsed.data.draft = false;
  if (publishDate) {
    parsed.data.date = publishDate; // Keep as Date object for proper serialization
  }

  const updatedContent = matter.stringify(parsed.content, parsed.data);
  writeFileSync(filePath, updatedContent);
}

/**
 * Unpublishes a blog post by setting draft: true
 */
export function unpublishPost(options: Pick<PublishOptions, 'filePath'>): void {
  const { filePath } = options;
  
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const fileContent = readFileSync(filePath, 'utf8');
  const parsed = matter(fileContent);
  
  // Update frontmatter to make it a draft
  parsed.data.draft = true;
  
  // Also handle 'published' field if it exists (for frameworks like Jekyll)
  if ('published' in parsed.data) {
    parsed.data.published = false;
  }

  const updatedContent = matter.stringify(parsed.content, parsed.data);
  writeFileSync(filePath, updatedContent);
}

/**
 * Gets post metadata from a markdown file
 */
export function getPostMeta(filePath: string): PostMeta {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const fileContent = readFileSync(filePath, 'utf8');
  const parsed = matter(fileContent);
  
  return {
    ...parsed.data,
    slug: slugify(parsed.data.title ?? '', { lower: true, strict: true })
  } as PostMeta;
}

// Export validation functions
export { validatePost, validateFrontmatter, validateContent, validateQuick, ValidationResult } from './validation.js';

// Export pattern detection functions
export { detectFrontmatterPattern, validateAgainstPattern, FrontmatterPattern, DetectionResult, FieldPattern } from './pattern-detection.js';

// Export framework detection functions
export { detectFramework, FrameworkInfo, ContentConfig, FrameworkDetectionResult } from './framework-detection.js';

// Export Astro schema analyzer functions and types
export { astroSchemaAnalyzer, AstroCollection, AstroCollectionField } from './astro-schema-analyzer.js';

/**
 * Determines if framework detection should be preferred over pattern detection
 * This happens when pattern detection fails, framework confidence is significantly higher,
 * or when pattern detection contains problematic fields that conflict with the schema
 */
function shouldPreferFrameworkOverPattern(
  patternDetection: DetectionResult, 
  frameworkDetection: FrameworkDetectionResult
): boolean {
  // If no framework detected, stick with pattern
  if (!frameworkDetection.primary) {
    return false;
  }
  
  // If pattern detection failed, use framework
  if (!patternDetection.success || !patternDetection.suggestedTemplate) {
    return true;
  }
  
  // Check for schema conflicts - prefer framework if pattern has problematic fields
  if (frameworkDetection.schemaAnalysis?.success && patternDetection.suggestedTemplate) {
    const hasSchemaConflicts = detectSchemaConflicts(
      patternDetection.suggestedTemplate,
      frameworkDetection.schemaAnalysis
    );
    if (hasSchemaConflicts) {
      console.log('🔧 Pattern detection contains fields that conflict with schema - using framework detection instead');
      return true;
    }
  }
  
  // If pattern confidence is low and framework confidence is high, prefer framework
  if (patternDetection.pattern?.confidence && frameworkDetection.primary.confidence) {
    if (patternDetection.pattern.confidence < 0.7 && frameworkDetection.primary.confidence > 0.8) {
      return true;
    }
  }
  
  return false;
}

/**
 * Detects conflicts between pattern detection template and schema requirements
 */
function detectSchemaConflicts(
  patternTemplate: Record<string, any>,
  schemaAnalysis: any
): boolean {
  if (!schemaAnalysis.fields) return false;
  
  // Check for problematic object fields that might fail validation
  for (const [fieldName, value] of Object.entries(patternTemplate)) {
    const schemaField = schemaAnalysis.fields.find((f: any) => f.name === fieldName);
    
    if (schemaField) {
      // Check for empty objects in optional image-like fields
      if (schemaField.type === 'image' && !schemaField.required) {
        if (typeof value === 'object' && value !== null && Object.keys(value).length === 0) {
          return true; // Empty object in optional image field
        }
      }
      
      // Check for other object fields with empty values that might cause validation issues
      if (schemaField.type === 'object' && !schemaField.required) {
        if (typeof value === 'object' && value !== null && Object.keys(value).length === 0) {
          return true; // Empty object in optional field
        }
      }
    }
  }
  
  return false;
}