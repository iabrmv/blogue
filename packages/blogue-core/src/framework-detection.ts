/**
 * Framework Detection with Dynamic Schema Parsing
 * 
 * ESLint: Template generation from parsed schemas requires 'any' for dynamic object creation
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { schemaIntrospectionService } from './schema-introspection.js';
import { astroSchemaAnalyzer, AstroCollection } from './astro-schema-analyzer.js';

export interface FrameworkInfo {
  name: string;
  version?: string;
  confidence: number; // 0-1
  detectedBy: string[]; // What files/indicators led to detection
  contentConfig?: ContentConfig;
}

export interface ContentConfig {
  defaultDir: string;
  frontmatterTemplate: Record<string, any>;
  dateField: string;
  draftField?: string;
  publishedField?: string;
  setupDocs?: string;
}

export interface FrameworkDetectionResult {
  frameworks: FrameworkInfo[];
  primary: FrameworkInfo | null;
  contentDir: string;
  suggestedTemplate: Record<string, any> | null;
  schemaAnalysis?: import('./schema-introspection.js').SchemaAnalysis;
  astroCollections?: AstroCollection[];
}

/**
 * Detects static site generator frameworks in the current project
 */
export async function detectFramework(projectRoot: string = process.cwd(), preferredDateFormat?: 'string' | 'date'): Promise<FrameworkDetectionResult> {
  const frameworks: FrameworkInfo[] = [];
  let astroSchemaAnalysis: any = undefined;
  let astroCollections: AstroCollection[] = [];
  
  // Check for each framework - start with Astro using new analyzer
  const astroResult = await detectAstroWithCollections(projectRoot, preferredDateFormat);
  if (astroResult.framework) {
    frameworks.push(astroResult.framework);
    astroSchemaAnalysis = astroResult.schemaAnalysis;
    astroCollections = astroResult.collections ?? [];
  }
  
  const hugoInfo = detectHugo(projectRoot);
  if (hugoInfo) frameworks.push(hugoInfo);
  
  const jekyllInfo = detectJekyll(projectRoot);
  if (jekyllInfo) frameworks.push(jekyllInfo);
  
  const eleventyInfo = detectEleventy(projectRoot);
  if (eleventyInfo) frameworks.push(eleventyInfo);
  
  const nextInfo = detectNextJS(projectRoot);
  if (nextInfo) frameworks.push(nextInfo);
  
  const gatsbyInfo = detectGatsby(projectRoot);
  if (gatsbyInfo) frameworks.push(gatsbyInfo);
  
  // Sort by confidence
  frameworks.sort((a, b) => b.confidence - a.confidence);
  
  const primary = frameworks[0] ?? null;
  const contentDir = primary?.contentConfig?.defaultDir ?? 'src/content/blog';
  const suggestedTemplate = primary?.contentConfig?.frontmatterTemplate ?? null;
  
  return {
    frameworks,
    primary,
    contentDir,
    suggestedTemplate,
    schemaAnalysis: primary?.name === 'Astro' ? astroSchemaAnalysis : undefined,
    astroCollections: astroCollections.length > 0 ? astroCollections : undefined
  };
}

/**
 * Detects Astro framework with collections using new schema analyzer
 */
async function detectAstroWithCollections(projectRoot: string, _preferredDateFormat?: 'string' | 'date'): Promise<{ 
  framework: FrameworkInfo | null; 
  schemaAnalysis?: any;
  collections?: AstroCollection[];
}> {
  const indicators: string[] = [];
  let confidence = 0;
  let version: string | undefined;

  // Check astro.config files
  const astroConfigs = ['astro.config.mjs', 'astro.config.ts', 'astro.config.js'];
  for (const config of astroConfigs) {
    if (existsSync(join(projectRoot, config))) {
      indicators.push(config);
      confidence += 0.4;
      break;
    }
  }

  // Check package.json for astro dependency
  const packageJsonPath = join(projectRoot, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      if (deps.astro) {
        indicators.push('package.json:astro');
        confidence += 0.4;
        version = deps.astro;
      }
    } catch {
      // Ignore malformed package.json
    }
  }

  // Check for src/content directory (Astro content collections)
  if (existsSync(join(projectRoot, 'src/content'))) {
    indicators.push('src/content/');
    confidence += 0.2;
  }

  if (confidence === 0) {
    return { framework: null };
  }

  // Use new schema analyzer to get collections
  const astroAnalysis = await astroSchemaAnalyzer.analyzeConfig(projectRoot);
  
  let defaultTemplate: Record<string, any> = {
    title: '',
    description: '',
    publishedAt: new Date(),
    updatedAt: new Date(),
    tags: [],
    draft: false
  };

  let defaultDir = 'src/content/blog';
  let collections: AstroCollection[] = [];

  if (astroAnalysis.success && astroAnalysis.collections.length > 0) {
    collections = astroAnalysis.collections;
    
    // Use first collection as default (user can choose later)
    const firstCollection = collections[0];
    defaultTemplate = astroSchemaAnalyzer.generateTemplate(firstCollection);
    defaultDir = firstCollection.defaultDir;
    
    confidence += 0.3; // Bonus for successful schema analysis
  }

  return {
    framework: {
      name: 'Astro',
      version,
      confidence: Math.min(confidence, 1.0),
      detectedBy: indicators,
      contentConfig: {
        defaultDir,
        frontmatterTemplate: defaultTemplate,
        dateField: 'publishedAt',
        draftField: 'draft',
        setupDocs: 'https://docs.astro.build/en/guides/content-collections/'
      }
    },
    schemaAnalysis: astroAnalysis.success ? astroAnalysis : undefined,
    collections
  };
}

/**
 * Original Astro detection (kept for backward compatibility)
 */
function _detectAstro(projectRoot: string, preferredDateFormat?: 'string' | 'date'): { framework: FrameworkInfo | null; schemaAnalysis?: any } {
  const indicators: string[] = [];
  let confidence = 0;
  let version: string | undefined;
  
  // Check astro.config files
  const astroConfigs = ['astro.config.mjs', 'astro.config.ts', 'astro.config.js'];
  for (const config of astroConfigs) {
    if (existsSync(join(projectRoot, config))) {
      indicators.push(config);
      confidence += 0.4;
      break;
    }
  }
  
  // Check package.json for astro dependency
  const packageJsonPath = join(projectRoot, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      if (deps.astro) {
        indicators.push('package.json:astro');
        confidence += 0.4;
        version = deps.astro;
      }
    } catch {
      // Ignore malformed package.json
    }
  }
  
  // Check for src/content directory (Astro content collections)
  if (existsSync(join(projectRoot, 'src/content'))) {
    indicators.push('src/content/');
    confidence += 0.2;
  }
  
  // Check for content config
  const contentConfigPath = join(projectRoot, 'src/content/config.ts');
  let frontmatterTemplate: Record<string, any> = {
    title: '',
    description: '',
    publishedAt: new Date(),
    updatedAt: new Date(),
    tags: [],
    draft: false
  };
  let dateField = 'publishedAt'; // Default Astro convention
  let schemaAnalysis; // Declare at function level
  
  if (existsSync(contentConfigPath)) {
    indicators.push('src/content/config.ts');
    confidence += 0.3;
    
    // Try to parse the content config for schema info
    try {
      const configContent = readFileSync(contentConfigPath, 'utf8');
      
      // First try the new hybrid ZOD-based introspection
      schemaAnalysis = schemaIntrospectionService.analyzeSchemaFromConfig(configContent);
      
      if (schemaAnalysis.success) {
        // Generate template from ZOD schema analysis
        frontmatterTemplate = schemaIntrospectionService.generateTemplate(schemaAnalysis);
        
        // Determine date field from schema
        const dateFields = schemaAnalysis.fields.filter(f => f.type === 'date');
        if (dateFields.length > 0) {
          dateField = dateFields[0].name;
        }
      } else {
        // Fallback to text-based parsing
        schemaAnalysis = schemaIntrospectionService.analyzeSchema(configContent);
        
        if (schemaAnalysis.success) {
          frontmatterTemplate = schemaIntrospectionService.generateTemplate(schemaAnalysis);
        } else {
          // Final fallback to old parsing method
          const parsedTemplate = parseAstroContentConfig(configContent, preferredDateFormat);
          if (parsedTemplate) {
            frontmatterTemplate = parsedTemplate;
            
            // Determine the actual date field from the parsed schema
            if ('date' in parsedTemplate) {
              dateField = 'date';
            } else if ('publishedAt' in parsedTemplate) {
              dateField = 'publishedAt';
            } else if ('publishDate' in parsedTemplate) {
              dateField = 'publishDate';
            }
          }
        }
      }
    } catch (error) {
      console.warn('Schema analysis failed:', error);
      // Use default template
    }
  }
  
  if (confidence === 0) return { framework: null };
  
  return {
    framework: {
      name: 'Astro',
      version,
      confidence: Math.min(confidence, 1.0),
      detectedBy: indicators,
      contentConfig: {
        defaultDir: 'src/content/blog',
        frontmatterTemplate,
        dateField,
        draftField: 'draft',
        setupDocs: 'https://docs.astro.build/en/guides/content-collections/'
      }
    },
    schemaAnalysis
  };
}

/**
 * Detects Hugo framework
 */
function detectHugo(projectRoot: string): FrameworkInfo | null {
  const indicators: string[] = [];
  let confidence = 0;
  
  // Check for Hugo config files
  const hugoConfigs = ['hugo.toml', 'hugo.yaml', 'hugo.json', 'config.toml', 'config.yaml', 'config.json'];
  for (const config of hugoConfigs) {
    if (existsSync(join(projectRoot, config))) {
      indicators.push(config);
      confidence += 0.5;
      break;
    }
  }
  
  // Check for content directory
  if (existsSync(join(projectRoot, 'content'))) {
    indicators.push('content/');
    confidence += 0.3;
  }
  
  // Check for themes directory
  if (existsSync(join(projectRoot, 'themes'))) {
    indicators.push('themes/');
    confidence += 0.2;
  }
  
  if (confidence === 0) return null;
  
  return {
    name: 'Hugo',
    confidence: Math.min(confidence, 1.0),
    detectedBy: indicators,
    contentConfig: {
      defaultDir: 'content/posts',
      frontmatterTemplate: {
        title: '',
        publishDate: new Date().toISOString().split('T')[0],
        lastmod: new Date().toISOString().split('T')[0],
        description: '',
        categories: [],
        tags: [],
        draft: false
      },
      dateField: 'publishDate',
      draftField: 'draft',
      setupDocs: 'https://gohugo.io/content-management/front-matter/'
    }
  };
}

/**
 * Detects Jekyll framework
 */
function detectJekyll(projectRoot: string): FrameworkInfo | null {
  const indicators: string[] = [];
  let confidence = 0;
  
  // Check for _config.yml
  if (existsSync(join(projectRoot, '_config.yml'))) {
    indicators.push('_config.yml');
    confidence += 0.5;
  }
  
  // Check for _posts directory
  if (existsSync(join(projectRoot, '_posts'))) {
    indicators.push('_posts/');
    confidence += 0.3;
  }
  
  // Check for Gemfile
  if (existsSync(join(projectRoot, 'Gemfile'))) {
    indicators.push('Gemfile');
    confidence += 0.2;
  }
  
  if (confidence === 0) return null;
  
  return {
    name: 'Jekyll',
    confidence: Math.min(confidence, 1.0),
    detectedBy: indicators,
    contentConfig: {
      defaultDir: '_posts',
      frontmatterTemplate: {
        layout: 'post',
        title: '',
        date: new Date().toISOString().split('T')[0],
        categories: [],
        tags: [],
        published: true
      },
      dateField: 'date',
      publishedField: 'published',
      setupDocs: 'https://jekyllrb.com/docs/front-matter/'
    }
  };
}

/**
 * Detects Eleventy (11ty) framework
 */
function detectEleventy(projectRoot: string): FrameworkInfo | null {
  const indicators: string[] = [];
  let confidence = 0;
  
  // Check for eleventy config files
  const eleventyConfigs = ['.eleventy.js', 'eleventy.config.js', '.eleventy.config.js'];
  for (const config of eleventyConfigs) {
    if (existsSync(join(projectRoot, config))) {
      indicators.push(config);
      confidence += 0.5;
      break;
    }
  }
  
  // Check package.json for @11ty/eleventy
  const packageJsonPath = join(projectRoot, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      if (deps['@11ty/eleventy']) {
        indicators.push('package.json:@11ty/eleventy');
        confidence += 0.4;
      }
    } catch {
      // Ignore malformed package.json
    }
  }
  
  if (confidence === 0) return null;
  
  return {
    name: 'Eleventy',
    confidence: Math.min(confidence, 1.0),
    detectedBy: indicators,
    contentConfig: {
      defaultDir: 'src/posts',
      frontmatterTemplate: {
        title: '',
        date: new Date().toISOString().split('T')[0],
        description: '',
        tags: [],
        draft: false
      },
      dateField: 'date',
      draftField: 'draft',
      setupDocs: 'https://www.11ty.dev/docs/data-frontmatter/'
    }
  };
}

/**
 * Detects Next.js framework
 */
function detectNextJS(projectRoot: string): FrameworkInfo | null {
  const indicators: string[] = [];
  let confidence = 0;
  
  // Check for next.config files
  const nextConfigs = ['next.config.js', 'next.config.mjs', 'next.config.ts'];
  for (const config of nextConfigs) {
    if (existsSync(join(projectRoot, config))) {
      indicators.push(config);
      confidence += 0.4;
      break;
    }
  }
  
  // Check package.json for next dependency
  const packageJsonPath = join(projectRoot, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      if (deps.next) {
        indicators.push('package.json:next');
        confidence += 0.5;
      }
    } catch {
      // Ignore malformed package.json
    }
  }
  
  if (confidence === 0) return null;
  
  return {
    name: 'Next.js',
    confidence: Math.min(confidence, 1.0),
    detectedBy: indicators,
    contentConfig: {
      defaultDir: 'posts',
      frontmatterTemplate: {
        title: '',
        date: new Date().toISOString().split('T')[0],
        description: '',
        tags: [],
        draft: false
      },
      dateField: 'date',
      draftField: 'draft',
      setupDocs: 'https://nextjs.org/blog/markdown'
    }
  };
}

/**
 * Detects Gatsby framework
 */
function detectGatsby(projectRoot: string): FrameworkInfo | null {
  const indicators: string[] = [];
  let confidence = 0;
  
  // Check for gatsby config files
  const gatsbyConfigs = ['gatsby-config.js', 'gatsby-config.ts'];
  for (const config of gatsbyConfigs) {
    if (existsSync(join(projectRoot, config))) {
      indicators.push(config);
      confidence += 0.5;
      break;
    }
  }
  
  // Check package.json for gatsby dependency
  const packageJsonPath = join(projectRoot, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      
      if (deps.gatsby) {
        indicators.push('package.json:gatsby');
        confidence += 0.4;
      }
    } catch {
      // Ignore malformed package.json
    }
  }
  
  if (confidence === 0) return null;
  
  return {
    name: 'Gatsby',
    confidence: Math.min(confidence, 1.0),
    detectedBy: indicators,
    contentConfig: {
      defaultDir: 'content/blog',
      frontmatterTemplate: {
        title: '',
        date: new Date().toISOString().split('T')[0],
        description: '',
        tags: [],
        draft: false
      },
      dateField: 'date',
      draftField: 'draft',
      setupDocs: 'https://www.gatsbyjs.com/docs/how-to/routing/adding-markdown-pages/'
    }
  };
}

/**
 * Parses a Zod object schema definition to extract field structure
 */
function _parseObjectSchema(objectDef: string): Record<string, any> {
  const obj: Record<string, any> = {};
  
  try {
    // Extract the content between object({ ... }) - handle multiline
    const objectMatch = objectDef.match(/object\(\s*\{([\s\S]*?)\}\s*\)/);
    if (objectMatch) {
      const objectContent = objectMatch[1];
      
      // Parse nested fields - simpler regex for nested object content
      const lines = objectContent.split('\n');
      for (const line of lines) {
        const fieldMatch = line.trim().match(/^(\w+):\s*z\.(\w+)\(\)/);
        if (fieldMatch) {
          const fieldName = fieldMatch[1];
          const fieldType = fieldMatch[2];
          
          if (fieldType === 'string') {
            obj[fieldName] = '';
          } else if (fieldType === 'boolean') {
            obj[fieldName] = false;
          } else if (fieldType === 'number') {
            obj[fieldName] = 0;
          } else if (fieldType === 'array') {
            obj[fieldName] = [];
          } else {
            obj[fieldName] = '';
          }
        }
      }
    }
  } catch {
    // If parsing fails, return empty object
  }
  
  return Object.keys(obj).length > 0 ? obj : {};
}

/**
 * Attempts to parse Astro content config to extract schema info
 */
function parseAstroContentConfig(configContent: string, preferredDateFormat?: 'string' | 'date'): Record<string, any> | null {
  try {
    // Simple approach: convert Zod schema to a JSON-like structure
    // and parse it more reliably
    
    const template: Record<string, any> = {};
    
    // Extract the schema object content with balanced brace matching
    const schemaStart = configContent.indexOf('schema: z.object({');
    if (schemaStart === -1) return null;
    
    // Find the matching closing brace
    let braceCount = 0;
    const start = schemaStart + 'schema: z.object('.length;
    let end = start;
    
    for (let i = start; i < configContent.length; i++) {
      const char = configContent[i];
      if (char === '{') braceCount++;
      else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          end = i;
          break;
        }
      }
    }
    
    if (braceCount !== 0) return null; // Unmatched braces
    
    const schemaContent = configContent.substring(start + 1, end);
    
    // Convert Zod schema to a more parseable JSON-like format
    const jsonLike = schemaContent
      // Replace z.string() with "string"
      .replace(/z\.string\(\)/g, '"string"')
      .replace(/z\.boolean\(\)/g, '"boolean"')
      .replace(/z\.number\(\)/g, '"number"')
      .replace(/z\.date\(\)/g, '"date"')
      .replace(/z\.coerce\.date\(\)/g, '"date"')
      .replace(/z\.array\([^)]+\)/g, '"array"')
      // Handle defaults - preserve the value in a special format
      .replace(/\.default\(([^)]+)\)/g, '_DEFAULT_$1_DEFAULT_')
      .replace(/\.optional\(\)/g, '_OPTIONAL_')
      // Handle nested objects - convert to placeholder
      .replace(/z\.object\(\s*\{([^}]+)\}\s*\)/g, (match, content) => {
        // For now, detect common patterns
        if (content.includes('src:') && content.includes('alt:')) {
          return '"image_object"';
        } else if (content.includes('name:')) {
          return '"author_object"';
        }
        return '"object"';
      });
    
    // Parse field by field using simple line-by-line approach
    const lines = jsonLike.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === '{' || trimmed === '}') continue;
      
      // Match field: "type" pattern, possibly with default values
      const fieldMatch = trimmed.match(/^(\w+):\s*"([^"]+)"(.*)$/);
      if (fieldMatch) {
        const fieldName = fieldMatch[1];
        const fieldType = fieldMatch[2];
        const modifiers = fieldMatch[3] ?? '';
        
        // Extract default value if present
        const defaultMatch = modifiers.match(/_DEFAULT_([^_]+)_DEFAULT_/);
        const hasDefault = defaultMatch !== null;
        const defaultValue = hasDefault ? defaultMatch[1] : null;
        
        // Check if field is optional
        const isOptional = modifiers.includes('_OPTIONAL_');
        
        // Skip optional fields without defaults - don't include them at all
        // This prevents empty objects that fail validation
        if (isOptional && !hasDefault) {
          continue;
        }
        
        switch (fieldType) {
          case 'string':
            template[fieldName] = hasDefault && defaultValue ? JSON.parse(defaultValue) : '';
            break;
          case 'boolean':
            template[fieldName] = hasDefault && defaultValue ? JSON.parse(defaultValue) : false;
            break;
          case 'number':
            template[fieldName] = hasDefault && defaultValue ? parseFloat(defaultValue) : 0;
            break;
          case 'array':
            template[fieldName] = hasDefault && defaultValue ? JSON.parse(defaultValue) : [];
            break;
          case 'date':
            // Use preferred date format if specified, otherwise use Date object for Astro compatibility
            if (preferredDateFormat === 'string') {
              template[fieldName] = new Date().toISOString().split('T')[0]; // "2025-07-20"
            } else {
              // For Astro content collections, return actual Date object
              // This will be serialized as unquoted date in YAML which Astro can coerce
              template[fieldName] = new Date();
            }
            break;
          case 'image_object':
            template[fieldName] = { src: '', alt: '' };
            break;
          case 'author_object':
            template[fieldName] = { name: '', email: '' };
            break;
          case 'object':
            template[fieldName] = {};
            break;
          default:
            template[fieldName] = '';
        }
      }
    }
    
    return Object.keys(template).length > 0 ? template : null;
  } catch {
    // Fallback to simple string matching if schema parsing fails
    const fallbackTemplate: Record<string, any> = {
      title: '',
      description: '',
      tags: [],
      draft: false
    };
    
    // Look for date-related fields - use Date objects for proper serialization
    if (configContent.includes('publishedAt')) {
      fallbackTemplate.publishedAt = new Date();
    } else if (configContent.includes('publishDate')) {
      fallbackTemplate.publishDate = new Date();
    } else if (configContent.includes('date')) {
      fallbackTemplate.date = new Date();
    }
    
    // Look for other common fields
    if (configContent.includes('updatedAt')) {
      fallbackTemplate.updatedAt = new Date();
    }
    
    if (configContent.includes('author')) {
      fallbackTemplate.author = '';
    }
    
    if (configContent.includes('categories')) {
      fallbackTemplate.categories = [];
    }
    
    return fallbackTemplate;
  }
}