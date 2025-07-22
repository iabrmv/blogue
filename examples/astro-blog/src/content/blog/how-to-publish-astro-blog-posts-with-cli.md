---
title: How to publish Astro blog posts with CLI
date: 2025-07-22T00:00:00.000Z
tags: []
draft: false
description: Showcase of using blogue CLI tool
---
# How to publish Astro blog posts with CLI

Blogue is a powerful CLI tool designed to streamline the process of creating and publishing markdown blog posts, especially for Astro-based blogs. This guide will walk you through everything you need to know about using Blogue effectively.

## What is Blogue?

Blogue is a TypeScript-based CLI tool that automates the tedious parts of blog post management:

- **Smart post creation** with automatic frontmatter generation
- **Framework detection** that adapts to your project structure  
- **Automated publishing workflows** via GitHub Actions
- **Content validation** to catch issues before publishing
- **Git integration** with automatic PR creation

## Installation

Install Blogue globally via npm:

```bash
npm install -g @blogue/cli
```

Or use it directly with npx:

```bash
npx @blogue/cli new
```

## Creating Your First Post

### Basic Usage

The simplest way to create a new post:

```bash
blogue new
```

This will prompt you for:
- Post title
- Description (optional)
- And automatically detect your content directory

### Advanced Options

For more control, use command-line options:

```bash
blogue new --dir "src/content/blog" --author "Your Name" --tags "astro,cli,blog"
```

### Astro Integration

Blogue automatically detects Astro projects and their content collections. It will:

1. **Analyze your `astro.config.mjs`** to find content collections
2. **Detect schema requirements** from your collection definitions
3. **Generate appropriate frontmatter** that matches your schema
4. **Place files in the correct directories**

For example, if you have a blog collection defined like this:

```javascript
// astro.config.mjs
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    heroImage: z.string().optional(),
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { blog };
```

Blogue will automatically generate frontmatter that matches this schema, including proper field names and types.

## Publishing Workflow

### Local Publishing

To publish a draft post locally:

```bash
blogue publish --dir "src/content/blog"
```

This command:
1. Shows you all draft posts
2. Lets you select which one to publish
3. Updates the `draft` field to `false`
4. Adds or updates the publication date

### Automated GitHub Publishing

For a complete automated workflow:

```bash
blogue publish --auto-push
```

This advanced feature:
1. Creates a new git branch for your post
2. Validates the post content
3. Commits and pushes the changes
4. Creates a pull request
5. Can optionally enable auto-merge for seamless publishing

### Publishing Multiple Posts

You can also specify a particular file:

```bash
blogue publish --file "src/content/blog/my-post.md"
```

## Managing Your Posts

### Listing Posts

View all your posts with their status:

```bash
blogue list --dir "src/content/blog"
```

Filter by status:

```bash
# Show only drafts
blogue list --drafts-only

# Show only published posts  
blogue list --published-only
```

### Unpublishing Posts

Need to take a post offline? Use the unpublish command:

```bash
blogue unpublish --auto-push
```

This sets `draft: true` and can create a PR for the change.

## Advanced Features

### Framework Detection

Blogue can detect and adapt to various frameworks:

- **Astro** - Full content collection support
- **Next.js** - MDX and markdown support
- **Gatsby** - GraphQL frontmatter integration
- **Generic** - Works with any markdown-based blog

### Pattern Learning

Blogue learns from your existing posts by analyzing:
- Common frontmatter fields
- Field types and formats
- Required vs optional fields
- Naming conventions

This ensures new posts match your existing style perfectly.

### Content Validation

Before publishing, Blogue validates:
- Required frontmatter fields
- Date formats
- Tag structures  
- File naming conventions
- Content structure

### Git Integration

The `--auto-push` feature provides:
- Automatic branch creation
- Commit message generation
- Pull request creation
- Auto-merge setup (if enabled)
- Cleanup after merge/close

## Configuration

### Project-Level Config

Create a `blogue.config.js` in your project root:

```javascript
export default {
  contentDir: 'src/content/blog',
  author: 'Your Name',
  defaultTags: ['blog'],
  autoPublish: false,
  gitWorkflow: {
    enabled: true,
    autoMerge: true,
    branchPrefix: 'post/'
  }
};
```

## Best Practices

### 1. Use Descriptive Titles
Your post title becomes the filename slug, so make it clear and SEO-friendly.

### 2. Leverage Tags
Consistent tagging helps with content organization and discovery.

### 3. Write Good Descriptions  
The description appears in post previews and meta tags.

### 4. Use the Git Workflow
The `--auto-push` feature ensures posts are properly reviewed before going live.

### 5. Validate Before Publishing
Always run `blogue publish` to catch validation errors early.

## Troubleshooting

### Common Issues

**"Cannot find module '@blogue/core'"**
- Run `npm install` in your project root
- Ensure you're using a supported Node.js version (18+)

**"No content directory found"**  
- Specify the directory with `--dir` flag
- Check that the path exists and contains markdown files

**"GitHub CLI not found"**
- Install with `brew install gh` (macOS) or visit [cli.github.com](https://cli.github.com)
- Authenticate with `gh auth login`

**"Auto-merge failed"**
- Check repository settings for auto-merge permissions
- Ensure branch protection rules allow auto-merge

### Getting Help

- View all available commands: `blogue --help`
- Command-specific help: `blogue new --help`
- Verbose output: `blogue new --verbose`

## Conclusion

Blogue transforms blog post management from a manual chore into an automated, reliable workflow. Whether you're publishing one post or managing a content calendar, Blogue adapts to your needs and grows with your project.

The combination of intelligent framework detection, automated workflows, and Git integration makes it an essential tool for any serious blogger using markdown-based static sites.

Ready to streamline your blogging workflow? Install Blogue today and experience the difference!
