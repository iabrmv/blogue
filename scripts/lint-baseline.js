#!/usr/bin/env node

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const baselineFile = join(__dirname, '../lint-baseline.txt');

function runLintCheck() {
  try {
    execSync('npm run lint', { stdio: 'pipe' });
    console.log('🎉 All ESLint issues resolved!');
    writeFileSync(baselineFile, 'All ESLint issues resolved!\n');
    return true;
  } catch (error) {
    const output = error.stdout?.toString() || error.stderr?.toString() || '';
    
    // Parse ESLint output to extract error counts
    const errorMatch = output.match(/(\d+) errors?/);
    const warningMatch = output.match(/(\d+) warnings?/);
    
    const errorCount = errorMatch ? parseInt(errorMatch[1]) : 0;
    const warningCount = warningMatch ? parseInt(warningMatch[1]) : 0;
    const totalIssues = errorCount + warningCount;
    
    console.log(`\n📊 Current ESLint Issues: ${totalIssues} (${errorCount} errors, ${warningCount} warnings)\n`);
    
    // Extract all issue lines
    const lines = output.split('\n');
    const allIssues = lines.filter(line => 
      line.includes('error') || line.includes('warning')
    );
    
    // Separate errors and warnings
    const errors = allIssues.filter(line => line.includes('error'));
    const warnings = allIssues.filter(line => line.includes('warning'));
    
    // Write to baseline file - errors first, then warnings
    const baselineContent = [
      `Total Issues: ${totalIssues} (${errorCount} errors, ${warningCount} warnings)`,
      `Generated: ${new Date().toISOString()}`,
      '',
      'ERRORS:',
      ...errors,
      '',
      'WARNINGS:',
      ...warnings
    ].join('\n');
    
    writeFileSync(baselineFile, baselineContent);
    console.log(`📝 Baseline written to ${baselineFile}`);
    
    // Show first few errors to work on (prioritize errors over warnings)
    const nextToFix = errors.length > 0 ? errors.slice(0, 5) : warnings.slice(0, 5);
    if (nextToFix.length > 0) {
      console.log(`🔧 Next ${errors.length > 0 ? 'errors' : 'warnings'} to fix:`);
      nextToFix.forEach((line, index) => {
        console.log(`${index + 1}. ${line.trim()}`);
      });
    }
    
    return false;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runLintCheck();
}

export { runLintCheck };