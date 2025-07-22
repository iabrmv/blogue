# blogue

CLI tool for creating and managing markdown blog posts.

## Prerequisites

**GitHub CLI is required** for publishing workflow:

```bash
# Install GitHub CLI
# macOS: brew install gh
# Windows: winget install --id GitHub.cli  
# Linux: sudo apt install gh

# Authenticate
gh auth login
```

## Installation

```bash
npm install -g @blogue/cli
# or
npx @blogue/cli new "Post Title"
```

## What it does

- Creates markdown files with proper YAML frontmatter
- Parses Astro content configs and generates schema-compliant posts
- Learns frontmatter patterns from existing posts  
- Publishes via GitHub PRs with CI monitoring
- Handles multi-collection Astro projects

## Quick Start

**Blogue is fully interactive** - just run the commands and follow the prompts:

```bash
# Interactive post creation (recommended)
blogue new

# Interactive publishing (shows draft list) 
blogue publish

# Interactive unpublishing (shows published list)
blogue unpublish

# List posts with status filtering
blogue list --drafts-only
```

**The CLI handles everything automatically:**
- ✅ Framework detection and schema parsing
- ✅ Interactive prompts for all required fields
- ✅ GitHub PR creation and CI monitoring  
- ✅ Branch cleanup after successful merge

## Commands

### `blogue new [title]`
Create posts with intelligent framework detection and schema parsing.

```bash
# Interactive creation
blogue new

# Pre-filled title
blogue new "My Amazing Post"

# With options
blogue new --author "John Doe" --tags "javascript,astro" --verbose

# Astro collection selection
blogue new --collection "articles"
```

### `blogue publish [file]`
Publish posts via GitHub Actions with PR workflow.

```bash
# Interactive selection from drafts
blogue publish

# Publish specific file
blogue publish --file "src/content/blog/my-post.md"

# Disable GitHub integration
blogue publish --no-auto-push
```

### `blogue unpublish [file]`
Revert published posts to draft status via GitHub PR.

```bash
# Interactive selection from published posts
blogue unpublish

# Unpublish specific file
blogue unpublish --file "src/content/blog/published-post.md"
```

### `blogue list`
List posts with status and metadata.

```bash
# Show all posts
blogue list

# Filter by status
blogue list --drafts-only
blogue list --published-only

# Specify directory
blogue list --dir "content/posts"
```

## GitHub Integration

Blogue integrates seamlessly with GitHub Actions for a complete publishing workflow:

1. **Branch Creation** - Creates feature branches automatically
2. **PR Management** - Opens descriptive pull requests
3. **CI Monitoring** - Watches build status in real-time
4. **Auto-Merge** - Merges when all checks pass
5. **Cleanup** - Removes branches after merge

### Prerequisites

```bash
# Install GitHub CLI
gh --version

# Authenticate
gh auth login

# Your repo should have GitHub Actions enabled
```

## Framework Support

### Astro (Advanced)
- Parses `src/content/config.ts` automatically
- Supports multiple collections with selection
- Generates schema-compliant frontmatter
- Handles complex Zod types (images, nested objects)

### Universal (Pattern-based)
- Works with any markdown-based blog structure
- Analyzes existing posts to learn your patterns
- Statistical analysis of frontmatter fields
- Adapts to your specific format preferences
- Configurable directory structures

## Architecture

The CLI is built on top of `@blogue/core` with additional features:

- **Interactive Prompts** - Inquirer.js for beautiful CLI interactions  
- **Git Integration** - Simple-git for branch management
- **GitHub CLI** - Native GitHub CLI integration
- **Colorful Output** - Chalk for enhanced terminal experience
- **Type Safety** - Full TypeScript with comprehensive validation

## Development

```bash
# Clone and setup
git clone https://github.com/iabrmv/blogue.git
cd blogue
npm install

# Link for local testing
cd packages/blogue-cli
npm link

# Test locally
blogue new "Test Post" --verbose
```

For full documentation and examples, see the [main repository](https://github.com/iabrmv/blogue).