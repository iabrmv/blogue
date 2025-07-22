# Simple Markdown Example

This example demonstrates using Blogue CLI with a simple markdown blog structure.

## Setup

```bash
npm install
```

## Usage

```bash
# Create a new blog post in the posts directory
blogue new --dir "posts"

# List all posts
blogue list --dir "posts"

# Publish a draft
blogue publish --dir "posts"
```

## Structure

```
posts/
├── my-first-post.md
├── another-post.md
└── ...
```

This simple structure works well with:
- Static site generators
- Custom build scripts
- GitHub Pages
- Any markdown processor

## Generated Posts

Each post includes standard frontmatter:

```markdown
---
title: "My Post Title"
date: 2024-01-15
author: "Author Name"
description: "Post description"
tags:
  - markdown
  - blog
draft: false
---

# My Post Title

Write your content here...
```