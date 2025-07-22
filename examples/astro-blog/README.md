# Astro Blog Example

This example demonstrates how to use Blogue CLI with an Astro blog project.

## Setup

```bash
npm install
```

## Usage

```bash
# Create a new blog post in the Astro content directory
blogue new --dir "src/content/blog"

# Or use the default (which matches Astro's structure)
blogue new

# List all posts
blogue list

# Publish a draft
blogue publish
```

## Astro Integration

Blogue creates posts in `src/content/blog/` which is the standard Astro content collection directory. The generated frontmatter is compatible with Astro's content collections.

## Generated Structure

```
src/content/blog/
├── my-first-post.md
├── another-post.md
└── ...
```

Each post includes Astro-compatible frontmatter:

```markdown
---
title: "My Post Title"
date: 2024-01-15
author: "Author Name"
description: "Post description"
tags:
  - astro
  - web
draft: false
---

# My Post Title

Content goes here...
```