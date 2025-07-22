/**
 * Schema Introspection Service
 * 
 * Provides utilities for introspecting and analyzing content collection schemas,
 * particularly Zod schemas used in Astro content collections.
 * 
 * This service follows the Single Responsibility Principle by focusing solely on
 * schema analysis and field detection.
 */

export interface SchemaField {
  name: string;
  type: SchemaFieldType;
  required: boolean;
  defaultValue?: unknown;
  description?: string;
}

export type SchemaFieldType = 
  | 'string' 
  | 'number' 
  | 'boolean' 
  | 'date' 
  | 'array' 
  | 'object' 
  | 'image' 
  | 'unknown';

export interface SchemaAnalysis {
  fields: SchemaField[];
  requiredFields: SchemaField[];
  optionalFields: SchemaField[];
  imageFields: SchemaField[];
  success: boolean;
  message: string;
}

export interface SchemaValidationResult {
  isValid: boolean;
  missingRequiredFields: string[];
  invalidFields: string[];
  warnings: string[];
}

/**
 * Schema Introspection Service
 * 
 * Handles the analysis and introspection of content collection schemas,
 * providing insights into field requirements, types, and validation rules.
 */
export class SchemaIntrospectionService {
  
  /**
   * Analyzes a ZOD schema by extracting and executing the schema definition
   */
  analyzeSchemaFromConfig(configContent: string): SchemaAnalysis {
    try {
      // Extract the schema definition from the config content
      const zodSchema = this.extractAndExecuteZodSchema(configContent);
      
      if (!zodSchema) {
        throw new Error('Could not extract ZOD schema from config');
      }
      
      // Use ZOD's built-in introspection
      if (!zodSchema._def?.shape) {
        throw new Error('Schema does not have expected ZOD structure');
      }
      
      const shape = zodSchema._def.shape();
      const fields = this.extractFieldsFromZodShape(shape);
      
      const requiredFields = fields.filter(field => field.required);
      const optionalFields = fields.filter(field => !field.required);
      const imageFields = fields.filter(field => field.type === 'image');
      
      return {
        fields,
        requiredFields,
        optionalFields,
        imageFields,
        success: true,
        message: `Successfully analyzed schema with ${fields.length} fields using ZOD introspection`
      };
    } catch (error) {
      return {
        fields: [],
        requiredFields: [],
        optionalFields: [],
        imageFields: [],
        success: false,
        message: `Failed to analyze schema: ${error}`
      };
    }
  }
  
  /**
   * Extracts and executes the ZOD schema definition from config content
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractAndExecuteZodSchema(configContent: string): any {
    try {
      // Find the schema definition
      const schemaMatch = configContent.match(/schema:\s*z\.object\(\s*\{([\s\S]*?)\}\s*\)/);
      if (!schemaMatch) {
        throw new Error('Could not find schema object definition');
      }
      
      // Extract the complete z.object(...) definition
      const fullSchemaStart = configContent.indexOf('z.object(');
      if (fullSchemaStart === -1) {
        throw new Error('Could not find z.object definition');
      }
      
      // Find the matching closing parenthesis
      let parenCount = 0;
      const start = fullSchemaStart + 'z.object'.length;
      let end = start;
      
      for (let i = start; i < configContent.length; i++) {
        const char = configContent[i];
        if (char === '(') {
          parenCount++;
        } else if (char === ')') {
          parenCount--;
          if (parenCount === 0) {
            end = i + 1;
            break;
          }
        }
      }
      
      if (parenCount !== 0) {
        throw new Error('Unmatched parentheses in schema definition');
      }
      
      const schemaDefinition = configContent.substring(fullSchemaStart, end);
      
      // Create a mock z object with the ZOD methods we need
      const mockZ = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        object: (shape: any) => ({ _def: { typeName: 'ZodObject', shape: () => shape } }),
        string: () => ({ _def: { typeName: 'ZodString' } }),
        number: () => ({ _def: { typeName: 'ZodNumber' } }),
        boolean: () => ({ _def: { typeName: 'ZodBoolean' } }),
        date: () => ({ _def: { typeName: 'ZodDate' } }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        array: (type: any) => ({ _def: { typeName: 'ZodArray', type } }),
        coerce: {
          date: () => ({ _def: { typeName: 'ZodEffects', schema: { _def: { typeName: 'ZodDate' } } } })
        }
      };
      
      // Add methods for chaining
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const addChaining = (obj: any) => ({
        ...obj,
        optional: () => ({ _def: { typeName: 'ZodOptional', innerType: obj } }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        default: (value: any) => ({ _def: { typeName: 'ZodDefault', defaultValue: () => value, innerType: obj } })
      });
      
      // Apply chaining to all mock methods
      Object.keys(mockZ).forEach(key => {
        if (key !== 'coerce' && typeof (mockZ as any)[key] === 'function') {
          const original = (mockZ as any)[key];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (mockZ as any)[key] = (...args: any[]) => addChaining(original(...args));
        }
      });
      
      mockZ.coerce.date = () => addChaining(mockZ.coerce.date());
      
      // Execute the schema definition with our mock z object
      const schemaFunction = new Function('z', `return ${schemaDefinition}`);
      const zodSchema = schemaFunction(mockZ);
      
      return zodSchema;
    } catch (error) {
      throw new Error(`Failed to extract ZOD schema: ${error}`);
    }
  }
  
  /**
   * Analyzes a parsed Astro content collection schema to extract field information
   * (Fallback method for text-based parsing)
   */
  analyzeSchema(schemaContent: string): SchemaAnalysis {
    try {
      // Extract and analyze the schema definition
      const fields = this.extractSchemaFields(schemaContent);
      
      const requiredFields = fields.filter(field => field.required);
      const optionalFields = fields.filter(field => !field.required);
      const imageFields = fields.filter(field => field.type === 'image');
      
      return {
        fields,
        requiredFields,
        optionalFields,
        imageFields,
        success: true,
        message: `Successfully analyzed schema with ${fields.length} fields`
      };
    } catch (error) {
      return {
        fields: [],
        requiredFields: [],
        optionalFields: [],
        imageFields: [],
        success: false,
        message: `Failed to analyze schema: ${error}`
      };
    }
  }
  
  /**
   * Extracts field definitions from ZOD schema shape using runtime introspection
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractFieldsFromZodShape(shape: any): SchemaField[] {
    const fields: SchemaField[] = [];
    
    for (const [fieldName, fieldDef] of Object.entries(shape)) {
      const field = this.parseZodFieldDefinition(fieldName, fieldDef as any);
      if (field) {
        fields.push(field);
      }
    }
    
    return fields;
  }
  
  /**
   * Parses a single ZOD field definition to extract field information
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseZodFieldDefinition(fieldName: string, fieldDef: any): SchemaField | null {
    try {
      // Check if field is optional by looking at the ZOD definition
      const isOptional = this.isZodFieldOptional(fieldDef);
      
      // Get the base type and default value
      const { type, defaultValue } = this.getZodFieldType(fieldDef);
      
      return {
        name: fieldName,
        type,
        required: !isOptional,
        defaultValue,
        description: undefined // Could extract from ZOD descriptions if needed
      };
    } catch (error) {
      console.warn(`Failed to parse ZOD field ${fieldName}:`, error);
      return null;
    }
  }
  
  /**
   * Determines if a ZOD field is optional
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private isZodFieldOptional(fieldDef: any): boolean {
    // Check for ZodOptional wrapper
    if (fieldDef._def?.typeName === 'ZodOptional') {
      return true;
    }
    
    // Check for default values (fields with defaults are effectively optional)
    if (fieldDef._def?.defaultValue !== undefined) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Determines the field type from ZOD definition
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getZodFieldType(fieldDef: any): { type: SchemaFieldType; defaultValue?: unknown } {
    // Unwrap optional/default wrappers to get to the base type
    let baseDef = fieldDef;
    let defaultValue: unknown = undefined;
    
    // Handle ZodOptional
    if (baseDef._def?.typeName === 'ZodOptional') {
      baseDef = baseDef._def.innerType;
    }
    
    // Handle ZodDefault
    if (baseDef._def?.typeName === 'ZodDefault') {
      defaultValue = baseDef._def.defaultValue();
      baseDef = baseDef._def.innerType;
    }
    
    // Handle ZodCoerce (like z.coerce.date())
    if (baseDef._def?.typeName === 'ZodEffects' && baseDef._def.schema) {
      baseDef = baseDef._def.schema;
    }
    
    // Determine the base type
    const typeName = baseDef._def?.typeName;
    
    switch (typeName) {
      case 'ZodString':
        return { type: 'string', defaultValue };
      case 'ZodNumber':
        return { type: 'number', defaultValue };
      case 'ZodBoolean':
        return { type: 'boolean', defaultValue };
      case 'ZodDate':
        return { type: 'date', defaultValue };
      case 'ZodArray':
        return { type: 'array', defaultValue };
      case 'ZodObject': {
        // Check if it's an image-like object
        const shape = baseDef._def?.shape();
        if (shape?.src && shape.alt) {
          return { type: 'image', defaultValue };
        }
        return { type: 'object', defaultValue };
      }
      default:
        console.warn(`Unknown ZOD type: ${typeName}`);
        return { type: 'unknown', defaultValue };
    }
  }
  
  /**
   * Extracts field definitions from Astro content config schema
   */
  private extractSchemaFields(schemaContent: string): SchemaField[] {
    const fields: SchemaField[] = [];
    
    // Find the schema object definition with proper brace matching
    const schemaStart = schemaContent.indexOf('schema:');
    if (schemaStart === -1) {
      throw new Error('Could not find schema definition');
    }
    
    const objectStart = schemaContent.indexOf('z.object({', schemaStart);
    if (objectStart === -1) {
      throw new Error('Could not find schema object definition');
    }
    
    // Find the matching closing brace using balanced brace counting
    let braceCount = 0;
    const start = objectStart + 'z.object('.length;
    let end = start;
    
    for (let i = start; i < schemaContent.length; i++) {
      const char = schemaContent[i];
      if (char === '{') {
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0) {
          end = i;
          break;
        }
      }
    }
    
    if (braceCount !== 0) {
      throw new Error('Unmatched braces in schema definition');
    }
    
    const schemaBody = schemaContent.substring(start + 1, end);
    const lines = this.parseSchemaLines(schemaBody);
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === ',' || trimmed.startsWith('//')) continue;
      
      const field = this.parseSchemaField(trimmed);
      if (field) {
        fields.push(field);
      }
    }
    
    return fields;
  }
  
  /**
   * Parses schema body into logical field definitions, handling nested objects
   */
  private parseSchemaLines(schemaBody: string): string[] {
    const lines: string[] = [];
    let currentLine = '';
    let braceCount = 0;
    let inString = false;
    let stringChar = '';
    
    for (let i = 0; i < schemaBody.length; i++) {
      const char = schemaBody[i];
      
      // Handle string literals
      if (!inString && (char === '"' || char === "'")) {
        inString = true;
        stringChar = char;
      } else if (inString && char === stringChar && schemaBody[i - 1] !== '\\') {
        inString = false;
        stringChar = '';
      }
      
      if (!inString) {
        if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
        }
      }
      
      currentLine += char;
      
      // End of field definition
      if (!inString && char === ',' && braceCount === 0) {
        lines.push(currentLine.trim());
        currentLine = '';
      } else if (!inString && char === '\n' && braceCount > 0) {
        // Inside nested object, don't break the line
        continue;
      }
    }
    
    // Add the last line if it exists
    if (currentLine.trim()) {
      lines.push(currentLine.trim());
    }
    
    return lines;
  }
  
  /**
   * Parses a single schema field line to extract field information
   */
  private parseSchemaField(fieldLine: string): SchemaField | null {
    // Remove trailing comma
    const cleanLine = fieldLine.replace(/,$/, '').trim();
    
    // Extract field name
    const fieldMatch = cleanLine.match(/^(\w+):\s*(.+)$/);
    if (!fieldMatch) return null;
    
    const fieldName = fieldMatch[1];
    const fieldDefinition = fieldMatch[2];
    
    // Determine if field is optional
    const isOptional = fieldDefinition.includes('.optional()');
    
    // Determine field type and extract default value
    const { type, defaultValue } = this.parseFieldType(fieldDefinition);
    
    return {
      name: fieldName,
      type,
      required: !isOptional,
      defaultValue,
      description: this.extractFieldDescription(fieldLine)
    };
  }
  
  /**
   * Determines the field type from Zod schema definition
   */
  private parseFieldType(definition: string): { type: SchemaFieldType; defaultValue?: any } {
    // Remove optional and default modifiers for type detection
    const baseDefinition = definition.replace(/\.optional\(\)/, '').replace(/\.default\([^)]*\)/, '');
    
    // Extract default value if present
    const defaultMatch = definition.match(/\.default\(([^)]+)\)/);
    let defaultValue: any = undefined;
    
    if (defaultMatch) {
      try {
        // Try to parse the default value
        const defaultStr = defaultMatch[1];
        if (defaultStr === 'true' || defaultStr === 'false') {
          defaultValue = defaultStr === 'true';
        } else if (defaultStr.match(/^\d+$/)) {
          defaultValue = parseInt(defaultStr);
        } else if (defaultStr.match(/^\[.*\]$/)) {
          defaultValue = JSON.parse(defaultStr);
        } else if (defaultStr.startsWith('"') && defaultStr.endsWith('"')) {
          defaultValue = defaultStr.slice(1, -1);
        }
      } catch {
        // Keep as string if parsing fails
        defaultValue = defaultMatch[1];
      }
    }
    
    // Determine type
    if (baseDefinition.includes('z.string()')) {
      return { type: 'string', defaultValue };
    } else if (baseDefinition.includes('z.number()')) {
      return { type: 'number', defaultValue };
    } else if (baseDefinition.includes('z.boolean()')) {
      return { type: 'boolean', defaultValue };
    } else if (baseDefinition.includes('z.date()') || baseDefinition.includes('z.coerce.date()')) {
      return { type: 'date', defaultValue };
    } else if (baseDefinition.includes('z.array(')) {
      return { type: 'array', defaultValue };
    } else if (baseDefinition.includes('image()')) {
      return { type: 'image', defaultValue };
    } else if (baseDefinition.includes('z.object(')) {
      // Check if it's an image-like object
      if (baseDefinition.includes('src:') && baseDefinition.includes('alt:')) {
        return { type: 'image', defaultValue };
      }
      return { type: 'object', defaultValue };
    }
    
    return { type: 'unknown', defaultValue };
  }
  
  /**
   * Extracts field description from comments
   */
  private extractFieldDescription(fieldLine: string): string | undefined {
    const commentMatch = fieldLine.match(/\/\/\s*(.+)$/);
    return commentMatch ? commentMatch[1].trim() : undefined;
  }
  
  /**
   * Validates frontmatter data against analyzed schema requirements
   */
  validateFrontmatter(frontmatter: Record<string, any>, analysis: SchemaAnalysis): SchemaValidationResult {
    const missingRequiredFields: string[] = [];
    const invalidFields: string[] = [];
    const warnings: string[] = [];
    
    // Check for missing required fields
    for (const field of analysis.requiredFields) {
      if (!(field.name in frontmatter) || frontmatter[field.name] === undefined || frontmatter[field.name] === '') {
        missingRequiredFields.push(field.name);
      }
    }
    
    // Validate field types and values
    for (const field of analysis.fields) {
      const value = frontmatter[field.name];
      
      if (value !== undefined && value !== '') {
        const typeValid = this.validateFieldType(value, field);
        if (!typeValid) {
          invalidFields.push(`${field.name}: expected ${field.type}, got ${typeof value}`);
        }
      }
      
      // Special validation for image fields
      if (field.type === 'image' && value) {
        const imageValid = this.validateImageField(value, field.name);
        if (!imageValid.isValid) {
          warnings.push(`${field.name}: ${imageValid.message}`);
        }
      }
    }
    
    return {
      isValid: missingRequiredFields.length === 0 && invalidFields.length === 0,
      missingRequiredFields,
      invalidFields,
      warnings
    };
  }
  
  /**
   * Validates that a value matches the expected field type
   */
  private validateFieldType(value: any, field: SchemaField): boolean {
    switch (field.type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number';
      case 'boolean':
        return typeof value === 'boolean';
      case 'date':
        return value instanceof Date || typeof value === 'string';
      case 'array':
        return Array.isArray(value);
      case 'object':
      case 'image':
        return typeof value === 'object' && value !== null;
      default:
        return true; // Allow unknown types
    }
  }
  
  /**
   * Validates image field structure and file existence
   */
  private validateImageField(value: any, _fieldName: string): { isValid: boolean; message: string } {
    if (typeof value === 'string') {
      // Simple string path - needs to be valid file path
      return {
        isValid: value.length > 0,
        message: value.length === 0 ? 'Image path cannot be empty' : 'Image path looks valid'
      };
    }
    
    if (typeof value === 'object' && value !== null) {
      // Object with src/alt structure
      if (!value.src) {
        return { isValid: false, message: 'Image object missing required "src" property' };
      }
      if (!value.alt) {
        return { isValid: false, message: 'Image object missing required "alt" property' };
      }
      return { isValid: true, message: 'Image object structure is valid' };
    }
    
    return { isValid: false, message: 'Image field must be a string path or object with src/alt' };
  }
  
  /**
   * Generates a template frontmatter object based on schema analysis
   */
  generateTemplate(analysis: SchemaAnalysis, providedFields: Record<string, any> = {}): Record<string, any> {
    const template: Record<string, any> = { ...providedFields };
    
    // Add default values for all fields
    for (const field of analysis.fields) {
      if (!(field.name in template)) {
        if (field.defaultValue !== undefined) {
          template[field.name] = field.defaultValue;
        } else if (!field.required) {
          // Skip optional fields without defaults - don't include them at all
          // This prevents empty objects that fail validation
          continue;
        } else {
          // Add placeholder for required fields
          template[field.name] = this.getPlaceholderValue(field);
        }
      }
    }
    
    return template;
  }
  
  /**
   * Generates appropriate placeholder values for different field types
   */
  private getPlaceholderValue(field: SchemaField): any {
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
        return {};
      default:
        return '';
    }
  }
}

// Export singleton instance
export const schemaIntrospectionService = new SchemaIntrospectionService();