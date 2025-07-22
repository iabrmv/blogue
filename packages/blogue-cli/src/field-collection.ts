/**
 * Interactive Field Collection Service
 * 
 * Handles user interaction for collecting missing or required fields
 * during post creation. Follows the Single Responsibility Principle
 * by focusing solely on user input collection and validation.
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import { existsSync } from 'fs';
import { resolve, extname } from 'path';
// Import from the built package
export interface SchemaField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object' | 'image' | 'unknown';
  required: boolean;
  defaultValue?: any;
  description?: string;
}

export interface SchemaAnalysis {
  fields: SchemaField[];
  requiredFields: SchemaField[];
  optionalFields: SchemaField[];
  imageFields: SchemaField[];
  success: boolean;
  message: string;
}

export interface FieldCollectionOptions {
  skipOptional?: boolean;
  validateFiles?: boolean;
  workingDir?: string;
}

export interface CollectedFields {
  fields: Record<string, any>;
  skippedFields: string[];
  errors: string[];
}

/**
 * Interactive Field Collection Service
 * 
 * Responsible for prompting users for missing required fields
 * and collecting additional optional fields based on schema requirements.
 */
export class FieldCollectionService {
  
  /**
   * Collects missing required fields through interactive prompts
   */
  async collectRequiredFields(
    analysis: SchemaAnalysis, 
    existingFields: Record<string, any>,
    options: FieldCollectionOptions = {}
  ): Promise<CollectedFields> {
    const result: CollectedFields = {
      fields: { ...existingFields },
      skippedFields: [],
      errors: []
    };
    
    // Find missing required fields
    const missingRequired = analysis.requiredFields.filter(field => 
      !(field.name in existingFields) || 
      this.isEmpty(existingFields[field.name])
    );
    
    if (missingRequired.length === 0) {
      return result;
    }
    
    console.log(chalk.yellow('⚠️  Missing required fields detected in schema:'));
    missingRequired.forEach(field => {
      console.log(chalk.yellow(`  • ${field.name} (${field.type})`));
    });
    console.log();
    
    // Collect each missing field
    for (const field of missingRequired) {
      try {
        const value = await this.collectField(field, options);
        if (value !== null) {
          result.fields[field.name] = value;
        } else {
          result.skippedFields.push(field.name);
        }
      } catch (error) {
        result.errors.push(`Failed to collect ${field.name}: ${error}`);
      }
    }
    
    return result;
  }
  
  /**
   * Prompts user for optional fields they might want to include
   */
  async collectOptionalFields(
    analysis: SchemaAnalysis,
    existingFields: Record<string, any>,
    options: FieldCollectionOptions = {}
  ): Promise<CollectedFields> {
    const result: CollectedFields = {
      fields: { ...existingFields },
      skippedFields: [],
      errors: []
    };
    
    if (options.skipOptional) {
      return result;
    }
    
    // Find available optional fields
    const availableOptional = analysis.optionalFields.filter(field => 
      !(field.name in existingFields)
    );
    
    if (availableOptional.length === 0) {
      return result;
    }
    
    // Ask if user wants to add optional fields
    const { wantsOptional } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'wantsOptional',
        message: `Add optional fields? (${availableOptional.length} available)`,
        default: false
      }
    ]);
    
    if (!wantsOptional) {
      return result;
    }
    
    // Let user select which optional fields to add
    const { selectedFields } = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'selectedFields',
        message: 'Select optional fields to add:',
        choices: availableOptional.map(field => ({
          name: `${field.name} (${field.type})${field.description ? ' - ' + field.description : ''}`,
          value: field.name,
          checked: false
        }))
      }
    ]);
    
    // Collect selected optional fields
    for (const fieldName of selectedFields) {
      const field = availableOptional.find(f => f.name === fieldName);
      if (field) {
        try {
          const value = await this.collectField(field, options);
          if (value !== null) {
            result.fields[field.name] = value;
          }
        } catch (error) {
          result.errors.push(`Failed to collect ${field.name}: ${error}`);
        }
      }
    }
    
    return result;
  }
  
  /**
   * Collects a single field value through appropriate prompt
   */
  private async collectField(field: SchemaField, options: FieldCollectionOptions): Promise<any> {
    const promptConfig = this.createPromptConfig(field, options);
    
    if (!promptConfig) {
      console.log(chalk.gray(`Skipping ${field.name} (no prompt available for ${field.type})`));
      return null;
    }
    
    const answer = await inquirer.prompt([promptConfig]);
    let value = answer[field.name];
    
    // Post-process the value based on field type
    value = this.processFieldValue(value, field);
    
    // Validate the value
    const validation = this.validateFieldValue(value, field, options);
    if (!validation.isValid) {
      console.log(chalk.red(`❌ ${validation.message}`));
      
      // Retry prompt for critical fields
      if (field.required) {
        console.log(chalk.yellow('This field is required. Please try again.'));
        return this.collectField(field, options);
      } else {
        return null;
      }
    }
    
    return value;
  }
  
  /**
   * Creates appropriate inquirer prompt configuration for field type
   */
  private createPromptConfig(field: SchemaField, options: FieldCollectionOptions): any {
    const baseConfig = {
      name: field.name,
      message: this.createFieldMessage(field),
      default: field.defaultValue,
      validate: field.required ? this.createRequiredValidator() : undefined
    };
    
    switch (field.type) {
      case 'string':
        return {
          ...baseConfig,
          type: 'input'
        };
        
      case 'number':
        return {
          ...baseConfig,
          type: 'number'
        };
        
      case 'boolean':
        return {
          ...baseConfig,
          type: 'confirm',
          default: field.defaultValue ?? false
        };
        
      case 'array':
        return {
          ...baseConfig,
          type: 'input',
          message: `${baseConfig.message} (comma-separated)`,
          filter: (input: string) => input.split(',').map(s => s.trim()).filter(s => s.length > 0)
        };
        
      case 'image':
        return this.createImagePromptConfig(field, options);
        
      case 'object':
        // For now, skip complex objects
        return null;
        
      default:
        return {
          ...baseConfig,
          type: 'input'
        };
    }
  }
  
  /**
   * Creates specialized prompt configuration for image fields
   */
  private createImagePromptConfig(field: SchemaField, options: FieldCollectionOptions): any {
    return {
      name: field.name,
      type: 'input',
      message: `${this.createFieldMessage(field)} (file path)`,
      validate: (input: string) => {
        if (!input && field.required) {
          return 'Image path is required';
        }
        
        if (input && options.validateFiles) {
          const fullPath = resolve(options.workingDir ?? process.cwd(), input);
          if (!existsSync(fullPath)) {
            return `File not found: ${input}`;
          }
          
          const ext = extname(input).toLowerCase();
          const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
          if (!imageExtensions.includes(ext)) {
            return `File must be an image (${imageExtensions.join(', ')})`;
          }
        }
        
        return true;
      },
      filter: (input: string) => {
        if (!input) return input;
        
        // For image fields, create the appropriate object structure
        return {
          src: input,
          alt: '' // Will be collected separately
        };
      }
    };
  }
  
  /**
   * Creates a user-friendly message for field prompts
   */
  private createFieldMessage(field: SchemaField): string {
    let message = field.name;
    
    if (field.description) {
      message += ` (${field.description})`;
    }
    
    if (field.required) {
      message += ' *';
    }
    
    return message;
  }
  
  /**
   * Creates a validator for required fields
   */
  private createRequiredValidator() {
    return (input: any) => {
      if (this.isEmpty(input)) {
        return 'This field is required';
      }
      return true;
    };
  }
  
  /**
   * Post-processes field values based on their type
   */
  private processFieldValue(value: any, field: SchemaField): any {
    switch (field.type) {
      case 'date':
        if (typeof value === 'string' && value) {
          return new Date(value);
        }
        return value;
        
      case 'number':
        if (typeof value === 'string') {
          const parsed = parseFloat(value);
          return isNaN(parsed) ? value : parsed;
        }
        return value;
        
      default:
        return value;
    }
  }
  
  /**
   * Validates collected field values
   */
  private validateFieldValue(
    value: any, 
    field: SchemaField, 
    options: FieldCollectionOptions
  ): { isValid: boolean; message: string } {
    // Check required fields
    if (field.required && this.isEmpty(value)) {
      return { isValid: false, message: 'Required field cannot be empty' };
    }
    
    // Type-specific validation
    switch (field.type) {
      case 'image':
        return this.validateImageValue(value, options);
      case 'date':
        return this.validateDateValue(value);
      case 'number':
        return this.validateNumberValue(value);
      default:
        return { isValid: true, message: 'Valid' };
    }
  }
  
  /**
   * Validates image field values
   */
  private validateImageValue(value: any, options: FieldCollectionOptions): { isValid: boolean; message: string } {
    if (typeof value === 'object' && value !== null) {
      if (!value.src) {
        return { isValid: false, message: 'Image must have a source path' };
      }
      
      if (options.validateFiles) {
        const fullPath = resolve(options.workingDir ?? process.cwd(), value.src);
        if (!existsSync(fullPath)) {
          return { isValid: false, message: `Image file not found: ${value.src}` };
        }
      }
      
      return { isValid: true, message: 'Valid image object' };
    }
    
    return { isValid: false, message: 'Image must be an object with src and alt properties' };
  }
  
  /**
   * Validates date field values
   */
  private validateDateValue(value: any): { isValid: boolean; message: string } {
    if (value instanceof Date) {
      if (isNaN(value.getTime())) {
        return { isValid: false, message: 'Invalid date' };
      }
      return { isValid: true, message: 'Valid date' };
    }
    
    if (typeof value === 'string' && value) {
      const parsed = new Date(value);
      if (isNaN(parsed.getTime())) {
        return { isValid: false, message: 'Invalid date format' };
      }
      return { isValid: true, message: 'Valid date string' };
    }
    
    return { isValid: false, message: 'Date must be a valid Date object or date string' };
  }
  
  /**
   * Validates number field values
   */
  private validateNumberValue(value: any): { isValid: boolean; message: string } {
    if (typeof value === 'number' && !isNaN(value)) {
      return { isValid: true, message: 'Valid number' };
    }
    
    return { isValid: false, message: 'Must be a valid number' };
  }
  
  /**
   * Checks if a value is considered empty
   */
  private isEmpty(value: any): boolean {
    return value === null || 
           value === undefined || 
           value === '' || 
           (Array.isArray(value) && value.length === 0);
  }
  
  /**
   * Prompts for image alt text after collecting the image src
   */
  async collectImageAltText(imageSrc: string): Promise<string> {
    const { alt } = await inquirer.prompt([
      {
        type: 'input',
        name: 'alt',
        message: `Alt text for image "${imageSrc}":`,
        validate: (input: string) => {
          if (!input.trim()) {
            return 'Alt text is required for accessibility';
          }
          return true;
        }
      }
    ]);
    
    return alt;
  }
}

// Export singleton instance
export const fieldCollectionService = new FieldCollectionService();