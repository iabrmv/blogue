# blogue

A CLI tool for creating and managing markdown blog posts with Astro integration and GitHub workflow automation.

## Features

- **Astro integration** - Parses `src/content/config.ts` and handles Zod schemas
- **Pattern detection** - Learns frontmatter structure from existing posts
- **GitHub workflow** - Creates PRs, monitors CI, handles merging
- **TypeScript** - Full type safety throughout the codebase
- **Multi-collection** - Supports Astro's multiple content collections

## Prerequisites

<details>
<summary>
  <strong>Node.js & GitHub CLI installed</strong>
</summary>

**Node.js** (includes npm):
Download from: https://nodejs.org
Or use package managers:

```bash
macOS: brew install node
Windows: winget install OpenJS.NodeJS
Linux: sudo apt install nodejs npm
```

**GitHub CLI** for publishing functionality:

```bash
# macOS
brew install gh

# Windows
winget install --id GitHub.cli

# Linux (Ubuntu/Debian)
sudo apt update
sudo apt install gh

# Other platforms: https://cli.github.com/
```

**Authenticate GitHub CLI:**
```bash
gh auth login
# Follow the interactive prompts to authenticate
```
</details>

<details>
<summary>
  <strong>Deployment set up</strong>
</summary>

Blogue assumes your project has automated deployment configured to trigger on pushes to your default Git branch (usually `main` or `master`). This is common with platforms like:
- **Vercel** - Auto-deploys from GitHub on push
- **Netlify** - Continuous deployment from Git
- **GitHub Pages** - GitHub Actions workflow on push
- **AWS Amplify** - Git-based deployment

When Blogue publishes a post, it creates a PR that merges to your default branch, triggering your deployment automatically.
</details>

**Deployment Setup:**
Blogue assumes your project has automated deployment configured to trigger on pushes to your default Git branch (usually `main` or `master`). This is common with platforms like:
- **Vercel** - Auto-deploys from GitHub on push
- **Netlify** - Continuous deployment from Git
- **GitHub Pages** - GitHub Actions workflow on push
- **AWS Amplify** - Git-based deployment

When Blogue publishes a post, it creates a PR that merges to your default branch, triggering your deployment automatically.

</details>

## Installation

```bash
# Install globally
npm install -g @blogue/cli

# Or use with npx (no installation required)
npx @blogue/cli new "My First Post"
```

## Quick Start

**Blogue is fully interactive** - it will guide you through each step with prompts. The simplest usage is:

```bash
# Create a new blog post (interactive prompts)
blogue new

# Publish a draft post (interactive selection)
blogue publish

# Unpublish a post back to draft (interactive selection)  
blogue unpublish

# List posts with status
blogue list
```

**The CLI will automatically:**
- ✅ Detect your blog framework (Astro, Hugo, Jekyll, etc.)
- ✅ Parse content schemas and generate proper frontmatter
- ✅ Guide you through post creation with interactive prompts
- ✅ Handle GitHub PR workflow with CI monitoring
- ✅ Clean up branches after successful publishing

## Commands

### `blogue new [title]`

**Interactive post creation** - the CLI will prompt you for all needed information.

```bash
# Best usage: Let the CLI guide you
blogue new

# Optional: Pre-fill the title
blogue new "My Amazing Post"

# Advanced: Skip prompts with options
blogue new --author "Name" --tags "javascript,web" --collection "blog"
```

**What it does:**
- 🔍 Auto-detects your blog framework and content structure
- 📝 Prompts for title, description, tags, author (if not provided)
- 🎯 For Astro: Lets you choose content collection interactively  
- ✨ Generates schema-compliant frontmatter automatically
- 📁 Creates file in the correct directory with proper naming

### `blogue publish [file]`

**Interactive publishing** - shows all your drafts and lets you choose which to publish.

```bash
# Best usage: Interactive draft selection
blogue publish

# Optional: Publish specific file
blogue publish --file "path/to/post.md"

# Skip GitHub workflow (just change draft: false locally)
blogue publish --no-auto-push
```

**What it does:**
- 📋 Lists all draft posts interactively
- ✏️ Changes `draft: true` → `draft: false`
- 🌿 Creates GitHub branch and PR automatically  
- ⏳ Monitors CI status in real-time
- ✅ Auto-merges when all checks pass
- 🧹 Cleans up branches after successful merge

### `blogue unpublish [file]`

**Interactive unpublishing** - revert published posts back to draft status.

```bash  
# Best usage: Interactive published post selection
blogue unpublish

# Optional: Unpublish specific file
blogue unpublish --file "path/to/post.md"
```

### `blogue list`

Lists posts with draft/published status.

```bash
blogue list
blogue list --drafts-only
blogue list --published-only
```

## How it works

### Astro projects
Blogue uses `@babel/parser` to parse your `src/content/config.ts`, extracts Zod schemas, and generates compliant frontmatter.

```typescript
// Your config.ts
const blog = defineCollection({
  schema: z.object({
    title: z.string(),
    date: z.date(),
    tags: z.array(z.string()).default([])
  })
})
```

Results in:
```yaml
---
title: ""
date: 2024-01-15T10:00:00.000Z  
tags: []
draft: true
---
```

### Other projects
Analyzes existing `.md` files (up to 10), counts field frequency, and generates templates:
- Fields in >80% of posts → required
- Fields in 20-80% → optional  
- Fields in <20% → ignored

Basic type detection: `string | number | boolean | array | object | date`

## GitHub Integration

Requires `gh` CLI tool. When publishing:

1. Creates branch: `blogue/{post-slug}`
2. Commits changes
3. Opens PR with auto-generated title/body
4. Monitors CI status via `gh api`  
5. Auto-merges if checks pass
6. Cleans up branch

```bash
# Prerequisites
gh auth login
```


## Dependencies:
- `@babel/parser` + `@babel/traverse` - Parse TypeScript AST
- `zod-to-json-schema` - Convert Zod schemas to JSON
- `gray-matter` - YAML frontmatter parsing
- `simple-git` - Git operations
- `inquirer` - Interactive prompts

## License

MIT

## Why?

- No CMS database/admin panel to maintain
- Git-based workflow fits existing development process  
- Saves time due to automatic branching/PR merges
- Keeps clean git PR history
- CI integration catches build errors before they reach production

For developers who prefer markdown + git over WordPress/Ghost/etc.