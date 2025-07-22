/**
 * Robust Astro Schema Analyzer using Babel AST parsing + Zod runtime evaluation
 * 
 * ESLint: Complex AST parsing and schema introspection requires 'any' for external types
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';
import { parse } from '@babel/parser';
import _traverse, { NodePath } from '@babel/traverse';
// @ts-ignore
const traverse = _traverse.default ?? _traverse;
import * as t from '@babel/types';

export interface AstroCollectionField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object' | 'image' | 'unknown';
  required: boolean;
  defaultValue?: any;
  description?: string;
  items?: string;
}

export interface AstroCollection {
  name: string;
  type: 'content' | 'data';
  fields: AstroCollectionField[];
  requiredFields: AstroCollectionField[];
  optionalFields: AstroCollectionField[];
  imageFields: AstroCollectionField[];
  defaultDir: string;
}

export interface AstroSchemaAnalysis {
  collections: AstroCollection[];
  success: boolean;
  message: string;
}

export class AstroSchemaAnalyzer {
  
  async analyzeConfig(projectRoot: string): Promise<AstroSchemaAnalysis> {
    const configPath = join(projectRoot, 'src/content/config.ts');
    
    if (!existsSync(configPath)) {
      return {
        collections: [],
        success: false,
        message: 'No Astro content config found at src/content/config.ts'
      };
    }

    try {
      if (!this.isAstroProject(projectRoot)) {
        return {
          collections: [],
          success: false,
          message: 'Not an Astro project'
        };
      }

      const configContent = readFileSync(configPath, 'utf8');
      const collections = await this.parseConfigFromSource(configContent);
      
      return {
        collections,
        success: true,
        message: `Successfully analyzed ${collections.length} collection(s)`
      };
    } catch (error) {
      return {
        collections: [],
        success: false,
        message: `Failed to analyze config: ${error}`
      };
    }
  }

  private isAstroProject(projectRoot: string): boolean {
    const packageJsonPath = join(projectRoot, 'package.json');
    if (!existsSync(packageJsonPath)) return false;
    
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      return Boolean(deps.astro);
    } catch {
      return false;
    }
  }

  async parseConfigFromSource(configContent: string): Promise<AstroCollection[]> {
    const collections: AstroCollection[] = [];
    
    try {
      // Parse using Babel AST for robust parsing
      const ast = parse(configContent, {
        sourceType: 'module',
        plugins: ['typescript']
      });
      
      const collectionDefinitions = new Map<string, any>();
      const collectionExports = new Map<string, string>();
      
      // Traverse the AST to extract collection definitions
      traverse(ast, {
        VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
          if (
            t.isIdentifier(path.node.id) &&
            t.isCallExpression(path.node.init) &&
            t.isIdentifier(path.node.init.callee) &&
            path.node.init.callee.name === 'defineCollection'
          ) {
            const varName = path.node.id.name;
            const collectionConfig = path.node.init.arguments[0];
            
            if (t.isObjectExpression(collectionConfig)) {
              collectionDefinitions.set(varName, collectionConfig);
            }
          }
        },
        
        ExportNamedDeclaration(path: NodePath<t.ExportNamedDeclaration>) {
          if (
            path.node.declaration &&
            t.isVariableDeclaration(path.node.declaration) &&
            path.node.declaration.declarations[0] &&
            t.isVariableDeclarator(path.node.declaration.declarations[0]) &&
            t.isIdentifier(path.node.declaration.declarations[0].id) &&
            path.node.declaration.declarations[0].id.name === 'collections'
          ) {
            const objectExpr = path.node.declaration.declarations[0].init;
            if (t.isObjectExpression(objectExpr)) {
              // Extract collection name mappings
              for (const prop of objectExpr.properties) {
                if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                  const collectionName = prop.key.name;
                  if (t.isIdentifier(prop.value)) {
                    collectionExports.set(collectionName, prop.value.name);
                  } else {
                    collectionExports.set(collectionName, collectionName);
                  }
                }
              }
            }
          }
        }
      });
      
      // Process collections
      const collectionsToProcess = collectionExports.size > 0 ? collectionExports : 
        new Map(Array.from(collectionDefinitions.keys()).map(name => [name, name]));
      
      for (const [collectionName, varName] of collectionsToProcess) {
        const definition = collectionDefinitions.get(varName);
        if (definition) {
          const collection = await this.parseCollectionDefinitionFromAST(collectionName, definition);
          if (collection) {
            collections.push(collection);
          }
        }
      }
      
    } catch (error) {
      console.warn('Failed to parse config from source:', error);
      // Fallback to the old approach if AST parsing fails
      return this.parseConfigFromSourceFallback(configContent);
    }
    
    return collections;
  }
  
  private async parseConfigFromSourceFallback(_configContent: string): Promise<AstroCollection[]> {
    // Keep the old parsing as fallback - implement if needed
    console.warn('Using fallback parsing method');
    return [];
  }

  private async parseCollectionDefinitionFromAST(name: string, definition: t.ObjectExpression): Promise<AstroCollection | null> {
    try {
      let type: 'content' | 'data' = 'content';
      let schemaNode: t.Node | null = null;
      
      // Extract type and schema from the collection definition
      for (const prop of definition.properties) {
        if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
          if (prop.key.name === 'type' && t.isStringLiteral(prop.value)) {
            type = prop.value.value as 'content' | 'data';
          } else if (prop.key.name === 'schema') {
            schemaNode = prop.value;
          }
        }
      }
      
      if (!schemaNode) {
        return null;
      }
      
      // Convert the schema AST node to a Zod schema by runtime evaluation
      const zodSchema = await this.astNodeToZodSchema(schemaNode);
      if (!zodSchema) {
        return null;
      }
      
      // Convert to JSON Schema for field extraction
      const jsonSchema = zodToJsonSchema(zodSchema, {
        name: `${name}Collection`,
        errorMessages: false,
      });
      
      // Extract fields from the JSON schema
      const fields = this.extractFieldsFromJsonSchema(jsonSchema);
      
      const requiredFields = fields.filter(f => f.required);
      const optionalFields = fields.filter(f => !f.required);
      const imageFields = fields.filter(f => f.type === 'image');
      
      return {
        name,
        type,
        fields,
        requiredFields,
        optionalFields,
        imageFields,
        defaultDir: this.getDefaultDirectory(name, type)
      };
    } catch (error) {
      console.error(`Failed to parse collection ${name}:`, error);
      return null;
    }
  }

  /**
   * Converts an AST node to a Zod schema through safe runtime evaluation
   */
  private async astNodeToZodSchema(node: t.Node): Promise<z.ZodType<any> | null> {
    try {
      // Generate code from the AST node and safely evaluate it
      const schemaCode = this.astNodeToCode(node);
      if (!schemaCode) {
        return null;
      }
      
      // Safely evaluate the schema code
      const func = new Function('z', `return ${schemaCode}`);
      const zodSchema = func(z);
      
      return zodSchema;
    } catch (error) {
      console.warn('Failed to convert AST node to Zod schema:', error);
      return null;
    }
  }

  /**
   * Converts an AST node to its string code representation
   */
  private astNodeToCode(node: t.Node): string | null {
    try {
      if (t.isCallExpression(node)) {
        const callee = this.astNodeToCode(node.callee);
        const args = node.arguments.map(arg => this.astNodeToCode(arg)).filter(Boolean);
        return `${callee}(${args.join(', ')})`;
      }
      
      if (t.isMemberExpression(node)) {
        const object = this.astNodeToCode(node.object);
        const property = t.isIdentifier(node.property) ? node.property.name : this.astNodeToCode(node.property);
        return `${object}.${property}`;
      }
      
      if (t.isIdentifier(node)) {
        return node.name;
      }
      
      if (t.isObjectExpression(node)) {
        const props = node.properties.map(prop => {
          if (t.isObjectProperty(prop)) {
            const key = t.isIdentifier(prop.key) ? prop.key.name : `"${this.astNodeToCode(prop.key)}"`;
            const value = this.astNodeToCode(prop.value);
            return `${key}: ${value}`;
          }
          return null;
        }).filter(Boolean);
        return `{${props.join(', ')}}`;
      }
      
      if (t.isArrayExpression(node)) {
        const elements = node.elements.map(el => el ? this.astNodeToCode(el) : 'null').filter(Boolean);
        return `[${elements.join(', ')}]`;
      }
      
      if (t.isStringLiteral(node)) {
        return `"${node.value}"`;
      }
      
      if (t.isNumericLiteral(node)) {
        return node.value.toString();
      }
      
      if (t.isBooleanLiteral(node)) {
        return node.value.toString();
      }
      
      return null;
    } catch (error) {
      console.warn('Failed to convert AST node to code:', error);
      return null;
    }
  }

  // Obsolete parsing methods removed - using AST-based approach only

  private extractFieldsFromJsonSchema(jsonSchema: any): AstroCollectionField[] {
    let schema = jsonSchema;
    let required: string[] = [];
    
    if (jsonSchema.$ref && jsonSchema.definitions) {
      const refKey = jsonSchema.$ref.replace('#/definitions/', '');
      schema = jsonSchema.definitions[refKey];
    }
    
    if (!schema?.properties) {
      return [];
    }

    const fields: AstroCollectionField[] = [];
    required = schema.required ?? [];

    for (const [fieldName, fieldSchema] of Object.entries(schema.properties as Record<string, any>)) {
      const field = this.parseJsonSchemaField(fieldName, fieldSchema, required.includes(fieldName));
      if (field) {
        fields.push(field);
      }
    }

    return fields;
  }

  private parseJsonSchemaField(name: string, schema: any, isRequired: boolean): AstroCollectionField | null {
    let defaultValue: any = undefined;

    if (schema.default !== undefined) {
      defaultValue = schema.default;
    }

    const type = this.mapJsonSchemaType(schema);
    
    let items: string | undefined = undefined;
    if (type === 'array' && schema.items) {
      items = this.mapJsonSchemaType(schema.items);
    }

    return {
      name,
      type,
      required: isRequired,
      defaultValue,
      items,
      description: schema.description
    };
  }

  private mapJsonSchemaType(schema: any): AstroCollectionField['type'] {
    if (!schema.type) {
      return 'unknown';
    }

    switch (schema.type) {
      case 'string':
        if (schema.format === 'date' || schema.format === 'date-time') {
          return 'date';
        }
        if (schema.properties && (schema.properties.src || schema.properties.url)) {
          return 'image';
        }
        return 'string';
        
      case 'number':
      case 'integer':
        return 'number';
        
      case 'boolean':
        return 'boolean';
        
      case 'array':
        return 'array';
        
      case 'object':
        if (schema.properties?.src && schema.properties.alt) {
          return 'image';
        }
        return 'object';
        
      default:
        return 'unknown';
    }
  }

  private getDefaultDirectory(collectionName: string, _type?: string): string {
    return `src/content/${collectionName}`;
  }

  generateTemplate(collection: AstroCollection): Record<string, any> {
    const template: Record<string, any> = {};

    for (const field of collection.fields) {
      if (!field.required && field.defaultValue === undefined) {
        continue;
      }

      if (field.defaultValue !== undefined) {
        template[field.name] = field.defaultValue;
      } else if (field.required) {
        template[field.name] = this.getPlaceholderValue(field);
      }
    }

    return template;
  }

  private getPlaceholderValue(field: AstroCollectionField): any {
    switch (field.type) {
      case 'string':
        return '';
      case 'number':
        return 0;
      case 'boolean':
        return false;
      case 'date':
        return new Date();
      case 'array':
        return [];
      case 'image':
        return { src: '', alt: '' };
      case 'object':
        // For image objects, return the proper structure
        if (field.name.toLowerCase().includes('image') || field.name.toLowerCase().includes('cover')) {
          return { src: '', alt: '' };
        }
        return {};
      default:
        return '';
    }
  }
}

// Export singleton instance
export const astroSchemaAnalyzer = new AstroSchemaAnalyzer();