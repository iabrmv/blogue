import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { createPost, publishPost, unpublishPost, getPostMeta, validatePost, detectFrontmatterPattern, detectFramework, AstroCollection } from '@blogue/core';
import { existsSync, readdirSync } from 'fs';
import { join, extname, dirname } from 'path';
import { GitManager, PublishState } from './git-utils.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

interface CreateOptions {
  dir: string;
  author?: string;
  tags?: string;
  draft: boolean;
  verbose?: boolean;
  collectionName?: string;
}

interface PublishOptions {
  file?: string;
  dir: string;
  autoPush?: boolean;
}

interface UnpublishOptions {
  file?: string;
  dir: string;
  autoPush?: boolean;
}

interface ListOptions {
  dir: string;
  draftsOnly?: boolean;
  publishedOnly?: boolean;
}

interface GitWorkflowOptions {
  filePath?: string;
  dir: string;
  autoPush: boolean;
  actionType: 'publish' | 'unpublish';
  actionDescription: string;
}

/**
 * Common workflow for git-based publish/unpublish operations
 */
async function executeGitWorkflow(
  options: GitWorkflowOptions,
  postAction: (_filePath: string) => void
): Promise<void> {
  const gitManager = new GitManager();
  let branchName: string | null = null;
  let originalBranch = '';
  let filePath = options.filePath;
  let publishState: PublishState | null = null;

  try {
    // Check GitHub CLI availability if needed
    if (options.autoPush && !(await gitManager.checkGitHubCLI())) {
      console.error(chalk.red('❌ GitHub CLI not found or not authenticated.'));
      console.log(chalk.yellow('💡 Install GitHub CLI: https://cli.github.com/'));
      console.log(chalk.yellow('💡 Then run: gh auth login'));
      process.exit(1);
    }

    if (!filePath) {
      // Find posts to work with
      if (!existsSync(options.dir)) {
        console.error(chalk.red(`❌ Directory not found: ${options.dir}`));
        process.exit(1);
      }

      const allFiles = readdirSync(options.dir)
        .filter(file => extname(file) === '.md')
        .map(file => join(options.dir, file))
        .filter(file => {
          try {
            getPostMeta(file);
            return true;
          } catch {
            return false;
          }
        });

      // Filter files based on action type
      const relevantFiles = allFiles.filter(file => {
        try {
          const meta = getPostMeta(file) as any;
          if (options.actionType === 'publish') {
            return meta.draft === true; // Show drafts for publishing
          } else {
            return meta.draft !== true; // Show published posts for unpublishing
          }
        } catch {
          return false;
        }
      });

      if (relevantFiles.length === 0) {
        const message = options.actionType === 'publish' ? 'No draft posts found' : 'No published posts found';
        console.log(chalk.yellow(`📝 ${message}`));
        return;
      }

      const { selectedFile } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedFile',
          message: `Which post do you want to ${options.actionType}?`,
          choices: relevantFiles.map(file => {
            const meta = getPostMeta(file) as any;
            const status = meta.draft === true ? '[draft]' : '[published]';
            return {
              name: `${status} ${meta.title} (${file})`,
              value: file
            };
          })
        }
      ]);

      filePath = selectedFile;
    }

    if (!filePath || !existsSync(filePath)) {
      console.error(chalk.red(`❌ File not found: ${filePath}`));
      process.exit(1);
    }

    // Get post metadata
    const meta = getPostMeta(filePath) as any;
    const title = meta.title;

    if (options.autoPush) {
      console.log(chalk.blue('🔍 Checking git status...'));
      
      // Store original branch
      const status = await gitManager.getStatus();
      originalBranch = status.currentBranch;
      
      // Check if it's safe to proceed
      const safetyCheck = await gitManager.checkSafetyForPublish(filePath);
      if (!safetyCheck.safe) {
        console.log(chalk.yellow(`⚠️ ${safetyCheck.reason}`));
        
        const { proceed } = await inquirer.prompt([{
          type: 'confirm',
          name: 'proceed',
          message: 'Continue with creating a new branch and PR anyway?',
          default: false
        }]);
        
        if (!proceed) {
          console.log(chalk.yellow('💡 Commit/stash your changes or use --no-auto-push'));
          process.exit(1);
        }
        
        console.log(chalk.blue('📝 Proceeding with new branch...'));
      }

      console.log(chalk.blue(`🌿 Creating ${options.actionType} branch...`));
      branchName = await gitManager.createPublishBranch(title, 'blogue');
    }

    // Validate post before action
    console.log(chalk.blue('🔍 Validating post...'));
    const validation = validatePost(filePath);
    
    if (!validation.isValid) {
      console.log(chalk.red('❌ Post validation failed:'));
      validation.errors.forEach((error: string) => {
        console.log(chalk.red(`  • ${error}`));
      });
      
      const { proceed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'proceed',
        message: `${options.actionDescription} anyway despite validation errors?`,
        default: false
      }]);
      
      if (!proceed) {
        console.log(chalk.yellow('💡 Fix the validation errors and try again'));
        process.exit(1);
      }
    }
    
    // Show warnings if any
    if (validation.warnings.length > 0) {
      console.log(chalk.yellow('⚠️ Post validation warnings:'));
      validation.warnings.forEach((warning: string) => {
        console.log(chalk.yellow(`  • ${warning}`));
      });
    }

    // Execute the post action (publish or unpublish)
    console.log(chalk.blue(`📝 ${options.actionDescription}...`));
    postAction(filePath);

    if (options.autoPush && branchName) {
      console.log(chalk.blue('📤 Committing and pushing changes...'));
      await gitManager.commitAndPush(filePath, title, branchName);

      console.log(chalk.blue('🔗 Creating pull request...'));
      const pr = await gitManager.createPullRequest(title, branchName, options.actionType);
      
      console.log(chalk.blue(`📋 PR created: ${pr.url}`));
      
      // Handle auto-merge setup
      await setupAutoMerge(gitManager, pr.number);
      
      // Create publish state for tracking
      publishState = {
        originalBranch,
        tempBranch: branchName,
        filePath,
        prNumber: pr.number,
        prUrl: pr.url,
        actionType: options.actionType
      };
      
      // Wait for PR completion and handle the result
      const result = await gitManager.waitForPRCompletion(pr.number);
      
      switch (result) {
        case 'merged':
          await gitManager.handleSuccess(publishState);
          break;
        case 'closed':
          await gitManager.handleFailure(publishState);
          break;
        case 'timeout':
          await gitManager.handleTimeout(publishState);
          break;
        case 'manual':
          console.log(chalk.blue('👋 Leaving you on the feature branch to continue manually'));
          break;
      }
    } else {
      console.log(chalk.green(`🚀 Post ${options.actionType}ed locally!`));
      console.log(chalk.blue(`📄 Title: ${title}`));
      console.log(chalk.yellow('💡 Commit and push manually, or use --auto-push next time'));
    }
    
  } catch (error) {
    console.error(chalk.red(`❌ Error ${options.actionType}ing post:`), error);
    
    // Cleanup on error
    if (branchName && options.autoPush && originalBranch && filePath) {
      try {
        const errorState: PublishState = {
          originalBranch,
          tempBranch: branchName,
          filePath,
          prNumber: 0,
          prUrl: '',
          actionType: options.actionType
        };
        await gitManager.handleFailure(errorState);
      } catch (cleanupError) {
        console.error(chalk.red('⚠️ Failed to cleanup:'), cleanupError);
      }
    }
    
    process.exit(1);
  }
}

/**
 * Helper to set up auto-merge for a PR
 */
async function setupAutoMerge(gitManager: GitManager, prNumber: number): Promise<void> {
  console.log(chalk.blue('🔍 Checking auto-merge settings...'));
  const autoMergeEnabled = await gitManager.checkAutoMergeEnabled();
  
  if (!autoMergeEnabled) {
    console.log(chalk.yellow('⚠️ Auto-merge is not enabled on this repository'));
    
    const { enableAutoMerge } = await inquirer.prompt([{
      type: 'confirm',
      name: 'enableAutoMerge',
      message: 'Would you like to enable auto-merge to avoid waiting for manual merging?',
      default: true
    }]);
    
    if (enableAutoMerge) {
      const success = await gitManager.enableAutoMerge();
      if (success) {
        await gitManager.enablePRAutoMerge(prNumber);
      }
    }
  } else {
    console.log(chalk.green('✅ Auto-merge is enabled'));
    await gitManager.enablePRAutoMerge(prNumber);
  }
}

// Read version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

const program = new Command();

program
  .name('blogue')
  .description('A simple CLI tool for publishing markdown blog posts')
  .version(packageJson.version);

program
  .command('new')
  .description('Create a new blog post')
  .option('-d, --dir <directory>', 'Content directory', 'src/content/blog')
  .option('-a, --author <author>', 'Post author')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .option('--no-draft', 'Create as published post')
  .option('-v, --verbose', 'Show detailed information about template detection')
  .action(async (options: CreateOptions) => {
    try {
      // Get title and description first
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'title',
          message: 'What\'s the title of your blog post?',
          validate: (input: string) => input.trim().length > 0 || 'Title is required'
        },
        {
          type: 'input',
          name: 'description',
          message: 'Brief description (optional):'
        }
      ]);

      // Analyze framework for collection support
      console.log(chalk.blue('🔍 Analyzing project configuration...'));
      const frameworkDetection = await detectFramework();
      
      let selectedCollection: AstroCollection | undefined = undefined;
      let contentDir = options.dir;

      // Handle Astro collection selection
      if (frameworkDetection.primary?.name === 'Astro' && frameworkDetection.astroCollections && frameworkDetection.astroCollections.length > 0) {
        if (frameworkDetection.astroCollections.length === 1) {
          // Single collection - use it automatically
          selectedCollection = frameworkDetection.astroCollections[0];
          contentDir = selectedCollection.defaultDir;
          console.log(chalk.green(`✓ Using Astro collection: ${selectedCollection.name}`));
        } else {
          // Multiple collections - let user choose
          console.log(chalk.green(`✓ Detected ${frameworkDetection.astroCollections.length} Astro content collections`));
          
          if (options.verbose) {
            frameworkDetection.astroCollections.forEach((collection: AstroCollection) => {
              console.log(chalk.gray(`  • ${collection.name} (${collection.type}) - ${collection.fields.length} fields`));
            });
          }
          
          const { collectionChoice } = await inquirer.prompt([
            {
              type: 'list',
              name: 'collectionChoice',
              message: 'Which content collection should this post belong to?',
              choices: frameworkDetection.astroCollections.map((collection: AstroCollection) => ({
                name: `${collection.name} (${collection.type}) - ${collection.requiredFields.length} required fields`,
                value: collection.name
              }))
            }
          ]);
          
          selectedCollection = frameworkDetection.astroCollections.find((c: AstroCollection) => c.name === collectionChoice);
          if (selectedCollection) {
            contentDir = selectedCollection.defaultDir;
            console.log(chalk.blue(`📂 Using collection directory: ${contentDir}`));
          }
        }
      }

      // Show detection info if verbose
      if (options.verbose) {
        
        // Try pattern detection first
        const patternDetection = detectFrontmatterPattern(contentDir);
        
        if (patternDetection.success && patternDetection.pattern) {
          console.log(chalk.green('✓ Detected existing post pattern'));
          console.log(chalk.gray(`  • Analyzed ${patternDetection.pattern.totalPosts} existing posts`));
          console.log(chalk.gray(`  • Confidence: ${Math.round(patternDetection.pattern.confidence * 100)}%`));
          console.log(chalk.gray(`  • Required fields: ${patternDetection.pattern.requiredFields.join(', ')}`));
          
          if (patternDetection.pattern.optionalFields.length > 0) {
            console.log(chalk.gray(`  • Optional fields: ${patternDetection.pattern.optionalFields.join(', ')}`));
          }
          
          console.log(chalk.blue('📝 Using detected pattern for new post'));
        } else if (frameworkDetection.primary) {
          const fw = frameworkDetection.primary;
          console.log(chalk.green(`✓ Detected ${fw.name} framework`));
          console.log(chalk.gray(`  • Confidence: ${Math.round(fw.confidence * 100)}%`));
          console.log(chalk.gray(`  • Detected by: ${fw.detectedBy.join(', ')}`));
          
          if (selectedCollection) {
            console.log(chalk.gray(`  • Collection: ${selectedCollection.name} (${selectedCollection.type})`));
            console.log(chalk.gray(`  • Required fields: ${selectedCollection.requiredFields.map((f: any) => f.name).join(', ')}`));
            console.log(chalk.gray(`  • Optional fields: ${selectedCollection.optionalFields.map((f: any) => f.name).join(', ')}`));
          } else if (fw.contentConfig) {
            console.log(chalk.gray(`  • Date field: ${fw.contentConfig.dateField}`));
            if (fw.contentConfig.draftField) {
              console.log(chalk.gray(`  • Draft field: ${fw.contentConfig.draftField}`));
            }
            if (fw.contentConfig.publishedField) {
              console.log(chalk.gray(`  • Published field: ${fw.contentConfig.publishedField}`));
            }
          }
          
          console.log(chalk.blue(`📝 Using ${fw.name} template for new post`));
        } else {
          console.log(chalk.yellow('⚠️ No framework detected, using default template'));
          console.log(chalk.gray('  • Will use basic frontmatter with title, date, author, description, tags, draft'));
        }
        
        console.log(''); // Empty line for spacing
      }

      const postOptions = {
        title: answers.title,
        contentDir,
        author: options.author ?? '',
        tags: options.tags ? options.tags.split(',').map((t: string) => t.trim()) : [],
        description: answers.description ?? '',
        draft: options.draft,
        collectionName: selectedCollection?.name
      };

      const filePath = await createPost(postOptions);
      
      console.log(chalk.green('✅ Blog post created successfully!'));
      console.log(chalk.blue(`📄 File: ${filePath}`));
      if (selectedCollection) {
        console.log(chalk.blue(`🏷️  Collection: ${selectedCollection.name}`));
      }
      console.log(chalk.yellow('💡 Run `blogue publish` when ready to publish'));
    } catch (error) {
      console.error(chalk.red('❌ Error creating post:'), error);
      process.exit(1);
    }
  });

program
  .command('publish')
  .description('Publish a blog post via GitHub PR')
  .option('-f, --file <file>', 'Specific file to publish')
  .option('-d, --dir <directory>', 'Content directory to search', 'src/content/blog')
  .option('--no-auto-push', 'Skip automatic PR creation and push')
  .option('--auto-push', 'Automatically create PR and push to GitHub')
  .action(async (options: PublishOptions) => {
    const autoPush = options.autoPush !== false;
    
    await executeGitWorkflow(
      {
        filePath: options.file,
        dir: options.dir,
        autoPush,
        actionType: 'publish',
        actionDescription: 'Publishing post'
      },
      (filePath: string) => publishPost({ filePath })
    );
  });

program
  .command('unpublish')
  .description('Unpublish a blog post via GitHub PR (set draft: true)')
  .option('-f, --file <file>', 'Specific file to unpublish')
  .option('-d, --dir <directory>', 'Content directory to search', 'src/content/blog')
  .option('--no-auto-push', 'Skip automatic PR creation and push')
  .option('--auto-push', 'Automatically create PR and push to GitHub')
  .action(async (options: UnpublishOptions) => {
    const autoPush = options.autoPush !== false;
    
    await executeGitWorkflow(
      {
        filePath: options.file,
        dir: options.dir,
        autoPush,
        actionType: 'unpublish',
        actionDescription: 'Unpublishing post'
      },
      (filePath: string) => unpublishPost({ filePath })
    );
  });

program
  .command('list')
  .description('List all blog posts')
  .option('-d, --dir <directory>', 'Content directory', 'src/content/blog')
  .option('--drafts-only', 'Show only draft posts')
  .option('--published-only', 'Show only published posts')
  .action((options: ListOptions) => {
    try {
      if (!existsSync(options.dir)) {
        console.error(chalk.red(`❌ Directory not found: ${options.dir}`));
        process.exit(1);
      }

      const files = readdirSync(options.dir)
        .filter(file => extname(file) === '.md')
        .map(file => {
          try {
            const filePath = join(options.dir, file);
            const meta = getPostMeta(filePath) as any;
            return { ...meta, filePath };
          } catch {
            return null;
          }
        })
        .filter((post): post is any => post !== null);

      let filteredFiles = files;
      if (options.draftsOnly) {
        filteredFiles = files.filter(post => post && post.draft === true);
      } else if (options.publishedOnly) {
        filteredFiles = files.filter(post => post && post.draft !== true);
      } else {
        // Sort to show drafts first, then published posts
        filteredFiles = files.sort((a, b) => {
          if (a.draft === b.draft) return 0;
          return a.draft ? -1 : 1; // drafts first
        });
      }

      if (filteredFiles.length === 0) {
        console.log(chalk.yellow('📝 No posts found'));
        return;
      }

      console.log(chalk.bold('📚 Blog Posts:'));
      filteredFiles.forEach(post => {
        if (post) {
          const prefix = post.draft ? chalk.yellow('[draft]') : chalk.green('[published]');
          console.log(`${prefix} ${chalk.blue(post.title)} (${post.date})`);
          console.log(`   📄 ${post.filePath}`);
        }
      });
    } catch (error) {
      console.error(chalk.red('❌ Error listing posts:'), error);
      process.exit(1);
    }
  });

export function main() {
  program.parse();
}