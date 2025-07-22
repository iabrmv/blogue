import simpleGit, { SimpleGit } from 'simple-git';
import { execSync } from 'child_process';
import chalk from 'chalk';
import slugify from 'slugify';
import path from 'path';
import inquirer from 'inquirer';

export interface GitStatus {
  isClean: boolean;
  hasUncommittedChanges: boolean;
  hasUnpushedCommits: boolean;
  currentBranch: string;
  files: string[];
}

export interface PublishOptions {
  filePath: string;
  title: string;
  autoPush?: boolean;
}

export interface PublishState {
  originalBranch: string;
  tempBranch: string;
  filePath: string;
  prNumber: number;
  prUrl: string;
  actionType?: 'publish' | 'unpublish';
}

export interface PRStatus {
  state: 'OPEN' | 'MERGED' | 'CLOSED';
  mergeable: boolean;
  mergedAt?: string;
  statusCheckRollup?: 'success' | 'failure' | 'pending' | 'error' | 'cancelled' | null;
}

export class GitManager {
  private git: SimpleGit;
  private gitRootDir: string;
  
  constructor(private workingDir: string = process.cwd()) {
    this.git = simpleGit(workingDir);
    this.gitRootDir = this.findGitRoot();
  }

  private findGitRoot(): string {
    try {
      const result = execSync('git rev-parse --show-toplevel', { 
        encoding: 'utf8',
        cwd: this.workingDir
      });
      return result.trim();
    } catch {
      return this.workingDir;
    }
  }

  private async getDefaultBranch(): Promise<string> {
    try {
      // Try to get the default branch from remote origin
      const result = await this.git.raw(['symbolic-ref', 'refs/remotes/origin/HEAD']);
      const match = result.match(/refs\/remotes\/origin\/(.+)/);
      if (match) {
        return match[1].trim();
      }
    } catch {
      // Fallback: try to determine from local branches
      try {
        const branches = await this.git.branchLocal();
        // Common default branch names in order of preference
        const defaultBranches = ['main', 'master', 'develop'];
        for (const branch of defaultBranches) {
          if (branches.all.includes(branch)) {
            return branch;
          }
        }
        // If none found, use the first branch or current
        return branches.current || branches.all[0] || 'main';
      } catch {
        // Ultimate fallback
        return 'main';
      }
    }
    return 'main';
  }

  async getStatus(): Promise<GitStatus> {
    const status = await this.git.status();
    const defaultBranch = await this.getDefaultBranch();
    const currentBranch = status.current ?? defaultBranch;
    
    // Check for unpushed commits
    let hasUnpushedCommits = false;
    try {
      const result = await this.git.log(['HEAD', `^origin/${currentBranch}`]);
      hasUnpushedCommits = result.total > 0;
    } catch {
      // Branch might not exist on remote yet
      hasUnpushedCommits = false;
    }

    return {
      isClean: status.files.length === 0,
      hasUncommittedChanges: status.files.length > 0,
      hasUnpushedCommits,
      currentBranch,
      files: status.files.map(f => f.path)
    };
  }

  async checkSafetyForPublish(filePath: string): Promise<{ safe: boolean; reason?: string }> {
    const status = await this.getStatus();
    
    // If completely clean, we're safe
    if (status.isClean && !status.hasUnpushedCommits) {
      return { safe: true };
    }

    // Check if changes are only related to the post we're publishing
    const relatedFiles = this.getRelatedFiles(filePath);
    const unrelatedChanges = status.files.filter(file => 
      !relatedFiles.includes(file)
    );

    if (unrelatedChanges.length > 0) {
      return { 
        safe: false, 
        reason: `Unrelated uncommitted changes found: ${unrelatedChanges.join(', ')}` 
      };
    }

    if (status.hasUnpushedCommits) {
      return {
        safe: false,
        reason: 'You have unpushed commits. Please push or stash them first.'
      };
    }

    return { safe: true };
  }

  private getRelatedFiles(filePath: string): string[] {
    // Convert absolute path to relative path from git repository root
    const relativePath = path.relative(this.gitRootDir, filePath);
    return [relativePath]; // For now, only the post file itself
  }

  async createPublishBranch(title: string, prefix: string = 'blogue'): Promise<string> {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const slug = slugify(title, { lower: true, strict: true });
    const branchName = `${prefix}/${date}-${slug}`;
    
    // Check if local branch already exists and delete it
    try {
      const branches = await this.git.branchLocal();
      if (branches.all.includes(branchName)) {
        console.log(chalk.yellow(`🧹 Cleaning up existing local branch: ${branchName}`));
        // Switch to default branch first, then delete the old branch
        const defaultBranch = await this.getDefaultBranch();
        await this.git.checkout(defaultBranch);
        await this.git.deleteLocalBranch(branchName, true); // Force delete
      }
    } catch {
      // Branch might not exist, that's fine
    }
    
    // Check if remote branch exists and delete it
    try {
      // Fetch latest refs to check remote branches
      await this.git.fetch('origin');
      const remoteBranches = await this.git.branch(['-r']);
      const remoteRef = `origin/${branchName}`;
      
      if (remoteBranches.all.includes(remoteRef)) {
        console.log(chalk.yellow(`🧹 Cleaning up existing remote branch: ${branchName}`));
        await this.git.push('origin', branchName, { '--delete': null });
      }
    } catch {
      // Remote branch might not exist, that's fine
    }
    
    // Create and checkout new branch
    await this.git.checkoutLocalBranch(branchName);
    
    return branchName;
  }

  async commitAndPush(filePath: string, title: string, branchName: string): Promise<void> {
    // Stage the file (force add in case it's in .gitignore)
    await this.git.add([filePath, '--force']);
    
    // Commit with descriptive message
    const commitMessage = `Publish: ${title}`;
    
    await this.git.commit(commitMessage);
    
    // Push to remote
    await this.git.push('origin', branchName, { '--set-upstream': null });
  }

  async createPullRequest(title: string, branchName: string, actionType: 'publish' | 'unpublish' = 'publish'): Promise<{ url: string; number: number; autoMergeEnabled: boolean }> {
    try {
      // Note: branchName is not used directly as GitHub CLI automatically detects the current branch
      // But we keep it in the signature for API consistency and potential future use
      
      // Use GitHub CLI to create PR (2025 syntax - no JSON output available)
      const actionLabel = actionType === 'publish' ? 'Publish' : 'Unpublish';
      const prTitle = `${actionLabel}: ${title}`;
      const prBody = `Automatically generated PR to ${actionType} blog post: **${title}**

This PR will auto-merge if all checks pass.`;

      // Create the PR first - this outputs the URL to stdout
      const result = execSync(
        `gh pr create --title "${prTitle}" --body "${prBody}"`,
        { 
          encoding: 'utf8',
          cwd: this.workingDir 
        }
      );
      
      // Parse the URL from the output to get PR number
      const urlMatch = result.trim().match(/https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/);
      if (!urlMatch) {
        throw new Error('Could not parse PR URL from GitHub CLI output');
      }
      
      const prUrl = urlMatch[0];
      const prNumber = parseInt(urlMatch[1]);
      
      // Try to enable auto-merge using current GitHub CLI syntax (2025)
      let autoMergeEnabled = false;
      try {
        execSync(
          `gh pr merge ${prNumber} --auto --squash`,
          { 
            encoding: 'utf8',
            cwd: this.workingDir,
            stdio: 'pipe' // Capture output to detect clean status
          }
        );
        autoMergeEnabled = true;
      } catch (autoMergeError: any) {
        // Check if the error is because PR is already in clean status (ready to merge)
        if (autoMergeError.stderr?.includes('Pull request is in clean status')) {
          // PR is ready to merge immediately - try to merge it now
          try {
            execSync(
              `gh pr merge ${prNumber} --squash`,
              { 
                encoding: 'utf8',
                cwd: this.workingDir,
                stdio: 'pipe'
              }
            );
            autoMergeEnabled = true; // Mark as successful since we merged it
          } catch {
            autoMergeEnabled = false;
          }
        } else {
          autoMergeEnabled = false;
        }
      }
      
      return {
        url: prUrl,
        number: prNumber,
        autoMergeEnabled
      };
    } catch (error) {
      throw new Error(`Failed to create PR: ${error}`);
    }
  }

  async checkGitHubCLI(): Promise<boolean> {
    try {
      execSync('gh --version', { stdio: 'ignore' });
      execSync('gh auth status', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Checks if auto-merge is enabled on the repository
   */
  async checkAutoMergeEnabled(): Promise<boolean> {
    try {
      // Check if auto-merge is available by trying to view repo settings
      // Since autoMergeAllowed isn't available, we'll check viewerCanAdminister
      // as a proxy for whether the user can enable auto-merge
      const result = execSync(
        'gh repo view --json viewerCanAdminister',
        { 
          encoding: 'utf8',
          cwd: this.workingDir,
          stdio: 'pipe'
        }
      );
      
      const repoInfo = JSON.parse(result);
      // If user can administer, assume auto-merge can be used
      // We'll try to enable it and see if it works
      return repoInfo.viewerCanAdminister ?? false;
    } catch (error) {
      console.warn('Could not check repository permissions:', error);
      return false;
    }
  }

  /**
   * Enables auto-merge on the repository if not already enabled
   */
  async enableAutoMerge(): Promise<boolean> {
    try {
      // Check if already enabled
      const isEnabled = await this.checkAutoMergeEnabled();
      if (isEnabled) {
        return true;
      }

      console.log('🔧 Enabling auto-merge on repository...');
      
      // Enable auto-merge using GitHub API
      execSync(
        'gh api repos/:owner/:repo --method PATCH --field allow_auto_merge=true',
        { 
          encoding: 'utf8',
          cwd: this.workingDir,
          stdio: 'pipe'
        }
      );
      
      console.log('✅ Auto-merge enabled successfully');
      return true;
    } catch (error) {
      console.warn('❌ Failed to enable auto-merge:', error);
      console.log('💡 You can enable it manually in GitHub Settings > General > Allow auto-merge');
      return false;
    }
  }

  /**
   * Enables auto-merge on a specific pull request
   */
  async enablePRAutoMerge(prNumber: number, mergeMethod: 'merge' | 'squash' | 'rebase' = 'squash'): Promise<boolean> {
    try {
      console.log(`🔧 Enabling auto-merge for PR #${prNumber}...`);
      
      execSync(
        `gh pr merge ${prNumber} --auto --${mergeMethod}`,
        { 
          encoding: 'utf8',
          cwd: this.workingDir,
          stdio: 'pipe'
        }
      );
      
      console.log('✅ Auto-merge enabled for this PR');
      return true;
    } catch (error) {
      console.warn('❌ Failed to enable auto-merge for PR:', error);
      return false;
    }
  }

  async checkPRStatus(prNumber: number): Promise<PRStatus & { checkDetails?: string[] }> {
    try {
      // Get basic PR info
      const prResult = execSync(
        `gh pr view ${prNumber} --json state,mergeable,mergedAt`,
        { 
          encoding: 'utf8',
          cwd: this.workingDir
        }
      );
      
      const prData = JSON.parse(prResult);
      
      // Get detailed check information - try multiple approaches
      let rollupStatus = null;
      let checkDetails: string[] = [];
      
      // Try using GitHub API to get check runs
      try {
        const checkRunsResult = execSync(
          `gh api repos/:owner/:repo/commits/$(gh pr view ${prNumber} --json headRefOid --jq '.headRefOid')/check-runs`,
          { 
            encoding: 'utf8',
            cwd: this.workingDir
          }
        );
        
        const checkRuns = JSON.parse(checkRunsResult.trim());
        
        if (checkRuns.check_runs && checkRuns.check_runs.length > 0) {
          let hasFailures = false;
          let hasPending = false;
          let hasSuccess = false;
          
          for (const run of checkRuns.check_runs) {
            const name = run.name;
            const status = run.status; // queued, in_progress, completed
            const conclusion = run.conclusion; // success, failure, neutral, cancelled, skipped, timed_out, action_required
            
            let displayStatus = status;
            if (status === 'completed' && conclusion) {
              displayStatus = conclusion;
            }
            
            checkDetails.push(`${name}: ${displayStatus}`);
            
            if (conclusion === 'failure' || conclusion === 'cancelled' || conclusion === 'timed_out' || conclusion === 'action_required') {
              hasFailures = true;
            } else if (status === 'queued' || status === 'in_progress' || conclusion === null) {
              hasPending = true;
            } else if (conclusion === 'success' || conclusion === 'neutral' || conclusion === 'skipped') {
              hasSuccess = true;
            }
          }
          
          // Determine overall status
          if (hasFailures) {
            rollupStatus = 'failure' as const;
          } else if (hasPending) {
            rollupStatus = 'pending' as const;
          } else if (hasSuccess) {
            rollupStatus = 'success' as const;
          } else {
            rollupStatus = 'pending' as const;
          }
        } else {
          // No check runs found
          rollupStatus = 'pending' as const;
          checkDetails = ['No checks found yet...'];
        }
        
      } catch (apiError: any) {
        // Log the error for debugging but fall back gracefully
        if (apiError.message && !apiError.message.includes('unexpected end of JSON input')) {
          console.warn('CI status check warning:', apiError.message);
        }
        rollupStatus = 'pending' as const;
        checkDetails = ['Checking CI status...'];
      }
      
      return {
        state: prData.state,
        mergeable: prData.mergeable,
        mergedAt: prData.mergedAt,
        statusCheckRollup: rollupStatus,
        checkDetails
      };
    } catch (error) {
      throw new Error(`Failed to check PR status: ${error}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async waitForPRCompletion(prNumber: number): Promise<'merged' | 'closed' | 'timeout' | 'manual'> {
    const startTime = Date.now();
    const timeout = 10 * 60 * 1000; // 10 minutes
    let pollInterval = 5000; // Start with 5 seconds
    let lastUpdateTime = startTime;
    
    console.log(chalk.blue('⏳ Waiting for PR to merge (this may take a few minutes)...'));
    
    while (Date.now() - startTime < timeout) {
      try {
        const status = await this.checkPRStatus(prNumber);
        
        if (status.state === 'MERGED') {
          console.log(chalk.green('✅ PR merged successfully!'));
          return 'merged';
        }
        
        if (status.state === 'CLOSED') {
          console.log(chalk.red('❌ PR was closed without merging'));
          return 'closed';
        }
        
        // If no CI checks are configured and PR is mergeable, it should auto-merge
        if (status.statusCheckRollup === 'success' && 
            status.checkDetails && 
            status.checkDetails.includes('No CI checks configured') &&
            status.mergeable) {
          console.log(chalk.green('✅ No CI checks required - PR should merge automatically'));
          // Continue waiting for auto-merge to complete
        }

        // Check for failed CI checks - GitHub uses lowercase failure states
        if (status.statusCheckRollup === 'failure' || status.statusCheckRollup === 'error' || 
            status.statusCheckRollup === 'cancelled') {
          console.log(chalk.red('❌ CI checks failed!'));
          
          // Show details of failed checks if available
          if (status.checkDetails && status.checkDetails.length > 0) {
            console.log(chalk.yellow('📋 Failed checks:'));
            status.checkDetails.forEach(detail => {
              console.log(chalk.yellow(`  • ${detail}`));
            });
          }
          
          // Prompt user for action
          const answer = await inquirer.prompt([
            {
              type: 'list',
              name: 'action',
              message: 'What would you like to do?',
              choices: [
                {
                  name: 'Close PR and clean up branches',
                  value: 'cleanup'
                },
                {
                  name: 'Continue working on this branch manually',
                  value: 'manual'
                }
              ]
            }
          ]);
          
          if (answer.action === 'cleanup') {
            console.log(chalk.blue('🧹 Closing PR and cleaning up...'));
            try {
              // Close the PR
              execSync(`gh pr close ${prNumber}`, { 
                cwd: this.workingDir,
                stdio: 'pipe'
              });
              console.log(chalk.green('✅ PR closed'));
              return 'closed';
            } catch {
              console.log(chalk.yellow('⚠️ Could not close PR automatically'));
              return 'closed';
            }
          } else {
            console.log(chalk.blue('🔧 You can now fix the issues manually and push changes to retry'));
            console.log(chalk.gray(`💡 Branch: ${await this.git.revparse(['--abbrev-ref', 'HEAD'])}`));
            console.log(chalk.gray(`📋 PR: ${prNumber}`));
            return 'manual';
          }
        }
        
        // Show progress updates every 30 seconds
        const elapsed = Date.now() - startTime;
        if (elapsed - (lastUpdateTime - startTime) >= 30000) {
          const minutes = Math.floor(elapsed / 60000);
          const seconds = Math.floor((elapsed % 60000) / 1000);
          const statusInfo = status.statusCheckRollup ? ` (CI: ${status.statusCheckRollup})` : '';
          console.log(chalk.gray(`⏳ Still waiting... (${minutes}m ${seconds}s)${statusInfo}`));
          lastUpdateTime = Date.now();
        }
        
        await this.sleep(pollInterval);
        pollInterval = Math.min(pollInterval * 1.2, 30000); // Max 30s interval
        
      } catch (error) {
        console.log(chalk.yellow(`⚠️ Error checking PR status, retrying... ${error}`));
        await this.sleep(5000);
      }
    }
    
    console.log(chalk.yellow('⏰ Timeout waiting for PR completion'));
    return 'timeout';
  }

  async handleSuccess(state: PublishState): Promise<void> {
    try {
      const defaultBranch = await this.getDefaultBranch();
      console.log(chalk.blue(`🔄 Syncing with ${defaultBranch} branch...`));
      await this.git.checkout(defaultBranch);
      await this.git.pull('origin', defaultBranch);
      
      // Clean up both local and remote branches
      console.log(chalk.blue('🧹 Cleaning up branches...'));
      await this.git.deleteLocalBranch(state.tempBranch, true);
      
      // Delete remote branch
      try {
        await this.git.push('origin', state.tempBranch, { '--delete': null });
      } catch {
        console.log(chalk.yellow('⚠️ Could not delete remote branch (may have been auto-deleted)'));
      }
      
      const actionLabel = state.actionType === 'unpublish' ? 'unpublished' : 'published';
      console.log(chalk.green(`🚀 Post ${actionLabel} and deployed!`));
    } catch (error) {
      console.log(chalk.yellow(`⚠️ Warning during cleanup: ${error}`));
    }
  }

  async handleFailure(state: PublishState): Promise<void> {
    try {
      console.log(chalk.blue('🔄 Restoring to original state...'));
      await this.git.checkout(state.originalBranch);
      
      // Restore the published file (draft: false version) from temp branch
      const relativePath = path.relative(this.gitRootDir, state.filePath);
      try {
        execSync(
          `git show ${state.tempBranch}:${relativePath} > ${state.filePath}`,
          { 
            cwd: this.gitRootDir,
            stdio: 'pipe'
          }
        );
        console.log(chalk.blue('📄 Published version preserved locally'));
      } catch {
        console.log(chalk.yellow('⚠️ Could not restore published file'));
      }
      
      // Clean up both local and remote branches
      console.log(chalk.blue('🧹 Cleaning up branches...'));
      await this.git.deleteLocalBranch(state.tempBranch, true);
      
      // Delete remote branch if it exists
      try {
        await this.git.push('origin', state.tempBranch, { '--delete': null });
      } catch {
        console.log(chalk.yellow('⚠️ Could not delete remote branch'));
      }
      
      console.log(chalk.yellow('❌ PR failed, but your work is preserved'));
    } catch (error) {
      console.log(chalk.red(`❌ Error during failure cleanup: ${error}`));
    }
  }

  async handleTimeout(state: PublishState): Promise<void> {
    try {
      console.log(chalk.blue('🔄 Timeout reached, cleaning up...'));
      await this.git.checkout(state.originalBranch);
      
      // Restore the published file from temp branch
      const relativePath = path.relative(this.gitRootDir, state.filePath);
      try {
        execSync(
          `git show ${state.tempBranch}:${relativePath} > ${state.filePath}`,
          { 
            cwd: this.gitRootDir,
            stdio: 'pipe'
          }
        );
        console.log(chalk.blue('📄 Published version preserved locally'));
      } catch {
        console.log(chalk.yellow('⚠️ Could not restore published file'));
      }
      
      // Clean up both local and remote branches
      console.log(chalk.blue('🧹 Cleaning up branches...'));
      await this.git.deleteLocalBranch(state.tempBranch, true);
      
      // Delete remote branch if it exists
      try {
        await this.git.push('origin', state.tempBranch, { '--delete': null });
      } catch {
        console.log(chalk.yellow('⚠️ Could not delete remote branch'));
      }
      
      console.log(chalk.yellow('⏰ Timeout waiting for merge, but your work is preserved'));
      console.log(chalk.gray('💡 Check the PR manually and merge if needed'));
    } catch (error) {
      console.log(chalk.red(`❌ Error during timeout cleanup: ${error}`));
    }
  }
}