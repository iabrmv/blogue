import { describe, it, expect, beforeEach } from 'vitest';
import { AstroSchemaAnalyzer } from '../astro-schema-analyzer';

describe('AstroSchemaAnalyzer', () => {
  let analyzer: AstroSchemaAnalyzer;

  beforeEach(() => {
    analyzer = new AstroSchemaAnalyzer();
  });

  describe('parseConfigFromSource', () => {
    it('should parse a single collection correctly', async () => {
      const configContent = `
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.coerce.date(),
    author: z.string().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
      `;

      const collections = await analyzer.parseConfigFromSource(configContent);

      expect(collections).toHaveLength(1);
      expect(collections[0]).toMatchObject({
        name: 'blog',
        type: 'content',
        defaultDir: 'src/content/blog'
      });

      // Check fields
      expect(collections[0].fields).toHaveLength(6);
      expect(collections[0].requiredFields).toHaveLength(2); // title, date
      expect(collections[0].optionalFields).toHaveLength(4); // description, author, tags, draft

      // Check specific fields
      const titleField = collections[0].fields.find(f => f.name === 'title');
      expect(titleField).toMatchObject({
        name: 'title',
        type: 'string',
        required: true
      });

      const tagsField = collections[0].fields.find(f => f.name === 'tags');
      expect(tagsField).toMatchObject({
        name: 'tags',
        type: 'array',
        required: false,
        defaultValue: [],
        items: 'string'
      });
    });

    it('should parse multiple collections correctly', async () => {
      const configContent = `
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
  }),
});

const projects = defineCollection({
  type: 'content',
  schema: z.object({
    name: z.string(),
    technologies: z.array(z.string()),
    featured: z.boolean().default(false),
  }),
});

const team = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
    role: z.string(),
  }),
});

export const collections = { blog, projects, team };
      `;

      const collections = await analyzer.parseConfigFromSource(configContent);

      expect(collections).toHaveLength(3);
      
      const blogCollection = collections.find(c => c.name === 'blog');
      expect(blogCollection).toBeDefined();
      expect(blogCollection?.type).toBe('content');
      expect(blogCollection?.fields).toHaveLength(2);

      const projectsCollection = collections.find(c => c.name === 'projects');
      expect(projectsCollection).toBeDefined();
      expect(projectsCollection?.type).toBe('content');
      expect(projectsCollection?.fields).toHaveLength(3);

      const teamCollection = collections.find(c => c.name === 'team');
      expect(teamCollection).toBeDefined();
      expect(teamCollection?.type).toBe('data');
      expect(teamCollection?.fields).toHaveLength(2);
    });

    it('should handle collections with renamed exports', async () => {
      const configContent = `
import { defineCollection, z } from 'astro:content';

const blogCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
  }),
});

const newsCollection = defineCollection({
  type: 'content',
  schema: z.object({
    headline: z.string(),
  }),
});

export const collections = { 
  blog: blogCollection,
  news: newsCollection 
};
      `;

      const collections = await analyzer.parseConfigFromSource(configContent);

      expect(collections).toHaveLength(2);
      
      const blogCollection = collections.find(c => c.name === 'blog');
      expect(blogCollection).toBeDefined();
      expect(blogCollection?.fields.find(f => f.name === 'title')).toBeDefined();

      const newsCollection = collections.find(c => c.name === 'news');
      expect(newsCollection).toBeDefined();
      expect(newsCollection?.fields.find(f => f.name === 'headline')).toBeDefined();
    });

    it('should handle complex nested schemas', async () => {
      const configContent = `
import { defineCollection, z } from 'astro:content';

const portfolio = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    image: z.object({
      src: z.string(),
      alt: z.string(),
    }),
    author: z.object({
      name: z.string(),
      email: z.string().optional(),
    }).optional(),
    tags: z.array(z.string()).default([]),
    metadata: z.object({
      views: z.number(),
      likes: z.number(),
    }).optional(),
  }),
});

export const collections = { portfolio };
      `;

      const collections = await analyzer.parseConfigFromSource(configContent);

      expect(collections).toHaveLength(1);
      expect(collections[0].name).toBe('portfolio');
      expect(collections[0].fields).toHaveLength(5);

      // Check image field is detected as image type
      const imageField = collections[0].fields.find(f => f.name === 'image');
      expect(imageField?.type).toBe('image');
      expect(imageField?.required).toBe(true);

      // Check object fields
      const authorField = collections[0].fields.find(f => f.name === 'author');
      expect(authorField?.type).toBe('object');
      expect(authorField?.required).toBe(false);

      const metadataField = collections[0].fields.find(f => f.name === 'metadata');
      expect(metadataField?.type).toBe('object');
      expect(metadataField?.required).toBe(false);
    });

    it('should handle different Zod types correctly', async () => {
      const configContent = `
import { defineCollection, z } from 'astro:content';

const testCollection = defineCollection({
  type: 'content',
  schema: z.object({
    stringField: z.string(),
    numberField: z.number(),
    booleanField: z.boolean(),
    dateField: z.date(),
    coerceDateField: z.coerce.date(),
    arrayField: z.array(z.string()),
    optionalField: z.string().optional(),
    defaultStringField: z.string().default('hello'),
    defaultBoolField: z.boolean().default(true),
    defaultArrayField: z.array(z.string()).default(['test']),
  }),
});

export const collections = { testCollection };
      `;

      const collections = await analyzer.parseConfigFromSource(configContent);

      expect(collections).toHaveLength(1);
      const fields = collections[0].fields;

      expect(fields.find(f => f.name === 'stringField')?.type).toBe('string');
      expect(fields.find(f => f.name === 'numberField')?.type).toBe('number');
      expect(fields.find(f => f.name === 'booleanField')?.type).toBe('boolean');
      expect(fields.find(f => f.name === 'dateField')?.type).toBe('date');
      expect(fields.find(f => f.name === 'coerceDateField')?.type).toBe('date');
      expect(fields.find(f => f.name === 'arrayField')?.type).toBe('array');

      // Check optional field
      expect(fields.find(f => f.name === 'optionalField')?.required).toBe(false);

      // Check default values
      expect(fields.find(f => f.name === 'defaultStringField')?.defaultValue).toBe('hello');
      expect(fields.find(f => f.name === 'defaultBoolField')?.defaultValue).toBe(true);
      expect(fields.find(f => f.name === 'defaultArrayField')?.defaultValue).toEqual(['test']);
    });

    it('should return empty array for invalid config', async () => {
      const invalidConfigs = [
        '', // empty
        'const blog = {};', // no defineCollection
        'const blog = defineCollection();', // no schema
        'export const collections = {};', // empty collections
      ];

      for (const configContent of invalidConfigs) {
        const collections = await analyzer.parseConfigFromSource(configContent);
        expect(collections).toHaveLength(0);
      }
    });

    it('should handle fallback when no collections export found', async () => {
      const configContent = `
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
  }),
});

const news = defineCollection({
  type: 'content',
  schema: z.object({
    headline: z.string(),
  }),
});

// No export statement
      `;

      const collections = await analyzer.parseConfigFromSource(configContent);

      expect(collections).toHaveLength(2);
      expect(collections.find(c => c.name === 'blog')).toBeDefined();
      expect(collections.find(c => c.name === 'news')).toBeDefined();
    });

    it('should handle comments and whitespace correctly', async () => {
      const configContent = `
import { defineCollection, z } from 'astro:content';

// Blog collection for articles
const blog = defineCollection({
  type: 'content', // Content type
  schema: z.object({
    title: z.string(), // Required title
    // Optional description
    description: z.string().optional(),
    date: z.coerce.date(),
  }),
});

/* 
 * Multi-line comment
 */
export const collections = { 
  blog // Blog collection
};
      `;

      const collections = await analyzer.parseConfigFromSource(configContent);

      expect(collections).toHaveLength(1);
      expect(collections[0].name).toBe('blog');
      expect(collections[0].fields).toHaveLength(3);
    });
  });

  describe('generateTemplate', () => {
    it('should generate template with required fields and defaults', async () => {
      const configContent = `
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    date: z.coerce.date(),
  }),
});

export const collections = { blog };
      `;

      const collections = await analyzer.parseConfigFromSource(configContent);
      const template = analyzer.generateTemplate(collections[0]);

      expect(template).toHaveProperty('title', '');
      expect(template).toHaveProperty('tags', []);
      expect(template).toHaveProperty('draft', false);
      expect(template).toHaveProperty('date');
      expect(template.date).toBeInstanceOf(Date);

      // Optional field without default should not be included
      expect(template).not.toHaveProperty('description');
    });

    it('should handle image fields correctly in template', async () => {
      const configContent = `
import { defineCollection, z } from 'astro:content';

const portfolio = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    coverImage: z.object({
      src: z.string(),
      alt: z.string(),
    }),
  }),
});

export const collections = { portfolio };
      `;

      const collections = await analyzer.parseConfigFromSource(configContent);
      const template = analyzer.generateTemplate(collections[0]);

      expect(template).toHaveProperty('title', '');
      expect(template).toHaveProperty('coverImage', { src: '', alt: '' });
    });
  });

  describe('error handling', () => {
    it('should handle malformed schemas gracefully', async () => {
      const configContent = `
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(,  // Malformed - missing closing paren
  }),
});

export const collections = { blog };
      `;

      const collections = await analyzer.parseConfigFromSource(configContent);
      // Should not crash, but may return empty array
      expect(Array.isArray(collections)).toBe(true);
    });

    it('should handle unmatched braces gracefully', async () => {
      const configContent = `
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
  // Missing closing braces
`;

      const collections = await analyzer.parseConfigFromSource(configContent);
      expect(Array.isArray(collections)).toBe(true);
    });
  });
});