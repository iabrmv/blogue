# blogue-core

Core library for creating and managing markdown blog posts.

## Installation

```bash
npm install @blogue/core
```

## What it does

- Parses Astro content configs (`src/content/config.ts`) using Babel AST
- Converts Zod schemas to JSON Schema for field extraction  
- Analyzes existing posts to detect frontmatter patterns
- Creates/publishes markdown files with YAML frontmatter
- Validates post structure and metadata

## Usage

```typescript
import { createPost, detectFramework, getPostMeta } from '@blogue/core';

// Detect framework and get config
const detection = await detectFramework();
console.log(detection.primary?.name); // "Astro" or null
console.log(detection.astroCollections); // Parsed collections

// Create post 
const filePath = createPost({
  title: 'My Post',
  contentDir: 'src/content/blog',
  author: 'Name',
  tags: ['typescript'],
  collectionName: 'blog'
});

// Read metadata
const meta = getPostMeta(filePath);
// { title, date, author, draft, slug, ... }
```

## API Reference

### Framework Detection

```typescript
import { detectFramework, AstroSchemaAnalyzer } from '@blogue/core';

// Comprehensive framework detection
const detection = await detectFramework('/path/to/project');
// Returns: { primary, frameworks, contentDir, astroCollections, ... }

// Direct Astro schema analysis
const analyzer = new AstroSchemaAnalyzer();
const analysis = await analyzer.analyzeConfig('/path/to/astro/project');
```

### Content Management

```typescript
// Create posts with framework-aware templates
createPost({
  title: string,
  contentDir?: string,
  author?: string,
  tags?: string[],
  description?: string,
  draft?: boolean,
  collectionName?: string // For Astro collections
}): string

// Publish/unpublish workflow
publishPost(filePath: string, options?: { publishDate?: Date }): void
unpublishPost(filePath: string): void

// Extract metadata with slug
getPostMeta(filePath: string): PostMeta & { slug: string }

// Validate post structure
validatePost(filePath: string): ValidationResult
```

### Pattern Detection

```typescript
import { detectFrontmatterPattern, generateTemplateFromPattern } from '@blogue/core';

// Learn from existing posts
const pattern = detectFrontmatterPattern('/path/to/posts');
// Returns field analysis with types, frequency, defaults

// Generate template from patterns
const template = generateTemplateFromPattern(pattern.fields);
```

### Types

```typescript
interface FrameworkDetectionResult {
  primary: FrameworkInfo | null;
  frameworks: FrameworkInfo[];
  contentDir: string;
  suggestedTemplate: Record<string, any> | null;
  astroCollections?: AstroCollection[];
  astroSchemaAnalysis?: AstroSchemaAnalysis;
}

interface AstroCollection {
  name: string;
  type: 'content' | 'data';
  fields: AstroCollectionField[];
  requiredFields: AstroCollectionField[];
  optionalFields: AstroCollectionField[];
  imageFields: AstroCollectionField[];
  defaultDir: string;
}

interface PostMeta {
  title: string;
  date?: Date;
  author?: string;
  tags?: string[];
  description?: string;
  draft?: boolean;
  slug: string;
}
```

## Architecture

### Key Components

- **`framework-detection.ts`** - Framework detection with deep Astro integration
- **`astro-schema-analyzer.ts`** - Advanced Astro Zod schema parsing using Babel AST
- **`pattern-detection.ts`** - Statistical analysis of existing posts for structure learning
- **`schema-introspection.ts`** - Zod schema introspection and type mapping
- **`validation.ts`** - Post validation and error reporting
- **`index.ts`** - Main API exports and post management functions

## Dependencies

- **@babel/parser** - TypeScript/JavaScript AST parsing
- **@babel/traverse** - AST traversal for complex schema extraction
- **zod-to-json-schema** - Convert Zod schemas to JSON Schema format
- **gray-matter** - Frontmatter parsing and generation
- **slugify** - URL-safe slug generation