import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  // Base JavaScript configuration
  js.configs.recommended,
  
  // TypeScript files
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: ['./packages/*/tsconfig.json']
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      // These rules require TypeScript project info, disabled for now
      // '@typescript-eslint/prefer-nullish-coalescing': 'error',
      // '@typescript-eslint/prefer-optional-chain': 'error', 
      // '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      
      // General rules
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off', // We use console for CLI output
      'no-debugger': 'error',
      'no-alert': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'prefer-const': 'error',
      'prefer-arrow-callback': 'error'
    }
  },
  
  // Test files
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/__tests__/**/*'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off'
    }
  },
  
  // CLI files - allow more flexible rules
  {
    files: ['packages/blogue-cli/**/*'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },
  
  // JavaScript files (including binary files)
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        module: 'writable',
        require: 'readonly',
        exports: 'writable'
      }
    },
    rules: {
      'no-console': 'off', // Allow console in JS files
      'no-undef': 'error'
    }
  },
  
  // Configuration files
  {
    files: ['*.config.js', '*.config.ts', 'eslint.config.js'],
    languageOptions: {
      globals: {
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'writable',
        require: 'readonly',
        exports: 'writable'
      }
    },
    rules: {
      '@typescript-eslint/no-var-requires': 'off'
    }
  },
  
  // Global ignores
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.js.map',
      'examples/**',
      '**/coverage/**',
      '**/*.d.ts',
      '**/*.tmp',
      '**/*.temp',
      'tmp/**',
      '.vscode/**',
      '.idea/**',
      '.DS_Store',
      'Thumbs.db',
      '**/*.log'
    ]
  }
];