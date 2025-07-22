/**
 * Tests for Schema Introspection Service
 */

import { describe, it, expect } from 'vitest';
import { SchemaIntrospectionService } from './schema-introspection.js';

describe('SchemaIntrospectionService', () => {
  const service = new SchemaIntrospectionService();

  describe('analyzeSchema', () => {
    it('should analyze basic Astro schema with required and optional fields', () => {
      const schemaContent = `
        import { defineCollection, z } from 'astro:content';
        
        const blog = defineCollection({
          schema: z.object({
            title: z.string(),
            description: z.string().optional(),
            date: z.coerce.date(),
            author: z.string().optional(),
            tags: z.array(z.string()).default([]),
            draft: z.boolean().default(false),
          }),
        });
      `;

      const result = service.analyzeSchema(schemaContent);

      expect(result.success).toBe(true);
      expect(result.fields).toHaveLength(6);
      
      // Check required fields (title, date, tags, draft are treated as required even with defaults)
      expect(result.requiredFields).toHaveLength(4);
      expect(result.requiredFields.map(f => f.name)).toContain('title');
      expect(result.requiredFields.map(f => f.name)).toContain('date');
      expect(result.requiredFields.map(f => f.name)).toContain('tags');
      expect(result.requiredFields.map(f => f.name)).toContain('draft');
      
      // Check optional fields (description, author)
      expect(result.optionalFields).toHaveLength(2);
      expect(result.optionalFields.map(f => f.name)).toContain('description');
      expect(result.optionalFields.map(f => f.name)).toContain('author');
    });

    it('should detect image fields correctly', () => {
      const schemaContent = `
        const blog = defineCollection({
          schema: ({ image }) => z.object({
            title: z.string(),
            heroImage: image(),
            thumbnail: image().optional(),
            coverImage: z.object({
              src: z.string(),
              alt: z.string()
            }),
          }),
        });
      `;

      const result = service.analyzeSchema(schemaContent);

      expect(result.success).toBe(true);
      expect(result.imageFields).toHaveLength(2);
      expect(result.imageFields.map(f => f.name)).toContain('heroImage');
      expect(result.imageFields.map(f => f.name)).toContain('thumbnail');
    });

    it('should extract default values correctly', () => {
      const schemaContent = `
        const blog = defineCollection({
          schema: z.object({
            title: z.string(),
            tags: z.array(z.string()).default([]),
            draft: z.boolean().default(false),
            priority: z.number().default(1),
            category: z.string().default("general"),
          }),
        });
      `;

      const result = service.analyzeSchema(schemaContent);

      expect(result.success).toBe(true);
      
      const tagsField = result.fields.find(f => f.name === 'tags');
      expect(tagsField?.defaultValue).toEqual([]);
      
      const draftField = result.fields.find(f => f.name === 'draft');
      expect(draftField?.defaultValue).toBe(false);
      
      const priorityField = result.fields.find(f => f.name === 'priority');
      expect(priorityField?.defaultValue).toBe(1);
      
      const categoryField = result.fields.find(f => f.name === 'category');
      expect(categoryField?.defaultValue).toBe('general');
    });

    it('should handle schema with function wrapper', () => {
      const schemaContent = `
        const blog = defineCollection({
          schema: ({ image }) => z.object({
            title: z.string(),
            heroImage: image(),
            date: z.coerce.date(),
          }),
        });
      `;

      const result = service.analyzeSchema(schemaContent);

      expect(result.success).toBe(true);
      expect(result.fields).toHaveLength(3);
      expect(result.imageFields).toHaveLength(1);
    });
  });

  describe('validateFrontmatter', () => {
    it('should validate frontmatter against schema requirements', () => {
      const analysis = {
        fields: [
          { name: 'title', type: 'string' as const, required: true },
          { name: 'date', type: 'date' as const, required: true },
          { name: 'description', type: 'string' as const, required: false },
        ],
        requiredFields: [
          { name: 'title', type: 'string' as const, required: true },
          { name: 'date', type: 'date' as const, required: true },
        ],
        optionalFields: [
          { name: 'description', type: 'string' as const, required: false },
        ],
        imageFields: [],
        success: true,
        message: 'Test schema'
      };

      const validFrontmatter = {
        title: 'Test Post',
        date: new Date(),
        description: 'Test description'
      };

      const result = service.validateFrontmatter(validFrontmatter, analysis);

      expect(result.isValid).toBe(true);
      expect(result.missingRequiredFields).toHaveLength(0);
      expect(result.invalidFields).toHaveLength(0);
    });

    it('should detect missing required fields', () => {
      const analysis = {
        fields: [
          { name: 'title', type: 'string' as const, required: true },
          { name: 'date', type: 'date' as const, required: true },
        ],
        requiredFields: [
          { name: 'title', type: 'string' as const, required: true },
          { name: 'date', type: 'date' as const, required: true },
        ],
        optionalFields: [],
        imageFields: [],
        success: true,
        message: 'Test schema'
      };

      const incompleteFrontmatter = {
        title: 'Test Post'
        // Missing date
      };

      const result = service.validateFrontmatter(incompleteFrontmatter, analysis);

      expect(result.isValid).toBe(false);
      expect(result.missingRequiredFields).toContain('date');
    });

    it('should validate image fields properly', () => {
      const analysis = {
        fields: [
          { name: 'title', type: 'string' as const, required: true },
          { name: 'image', type: 'image' as const, required: true },
        ],
        requiredFields: [
          { name: 'title', type: 'string' as const, required: true },
          { name: 'image', type: 'image' as const, required: true },
        ],
        optionalFields: [],
        imageFields: [
          { name: 'image', type: 'image' as const, required: true },
        ],
        success: true,
        message: 'Test schema'
      };

      const frontmatterWithValidImage = {
        title: 'Test Post',
        image: {
          src: './hero.jpg',
          alt: 'Hero image'
        }
      };

      const result = service.validateFrontmatter(frontmatterWithValidImage, analysis);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('generateTemplate', () => {
    it('should generate complete template with default values', () => {
      const analysis = {
        fields: [
          { name: 'title', type: 'string' as const, required: true },
          { name: 'date', type: 'date' as const, required: true },
          { name: 'tags', type: 'array' as const, required: false, defaultValue: [] },
          { name: 'draft', type: 'boolean' as const, required: false, defaultValue: false },
        ],
        requiredFields: [
          { name: 'title', type: 'string' as const, required: true },
          { name: 'date', type: 'date' as const, required: true },
        ],
        optionalFields: [
          { name: 'tags', type: 'array' as const, required: false, defaultValue: [] },
          { name: 'draft', type: 'boolean' as const, required: false, defaultValue: false },
        ],
        imageFields: [],
        success: true,
        message: 'Test schema'
      };

      const providedFields = {
        title: 'My Post'
      };

      const template = service.generateTemplate(analysis, providedFields);

      expect(template.title).toBe('My Post');
      expect(template.date).toBeInstanceOf(Date);
      expect(template.tags).toEqual([]);
      expect(template.draft).toBe(false);
    });

    it('should generate image placeholders correctly', () => {
      const analysis = {
        fields: [
          { name: 'title', type: 'string' as const, required: true },
          { name: 'image', type: 'image' as const, required: true },
        ],
        requiredFields: [
          { name: 'title', type: 'string' as const, required: true },
          { name: 'image', type: 'image' as const, required: true },
        ],
        optionalFields: [],
        imageFields: [
          { name: 'image', type: 'image' as const, required: true },
        ],
        success: true,
        message: 'Test schema'
      };

      const template = service.generateTemplate(analysis, { title: 'Test' });

      expect(template.image).toEqual({
        src: '',
        alt: ''
      });
    });
  });
});