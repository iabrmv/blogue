#!/usr/bin/env node

import('../dist/cli.js').then(module => {
  module.main();
}).catch(error => {
  console.error('Error loading CLI:', error);
  process.exit(1);
});