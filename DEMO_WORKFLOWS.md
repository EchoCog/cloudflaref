# Demo Workflow Generation System

This system automatically generates GitHub Actions workflows that deploy live demos based on documentation examples.

## Overview

The demo workflow generation system consists of three main components:

1. **Workflow Generator** (`scripts/generate-demo-workflows.ts`) - Scans documentation for examples and generates GitHub Actions workflows
2. **Project Generator** (`scripts/generate-demo-projects.ts`) - Creates deployable projects from code examples in documentation
3. **URL Updater** (`scripts/update-demo-urls.ts`) - Updates demo URLs in documentation after deployment

## How It Works

### 1. Documentation Scanning

The system scans the `src/content/docs/` directory for files with:
- `type: example` in frontmatter
- Deployable code blocks (JavaScript, TypeScript, Python)
- Valid example metadata

### 2. Workflow Generation

For each supported product (Workers, Pages, D1, Durable Objects, KV), the system generates:
- GitHub Actions workflow files in `.github/workflows/generated-demos/`
- Deploy steps for each example
- Automatic demo URL updates

### 3. Project Generation

When workflows run, they:
- Extract code from documentation examples
- Generate proper project structure (package.json, wrangler.toml, etc.)
- Create deployable projects in `generated-demos/` directory

### 4. Deployment

The workflows deploy each example to Cloudflare:
- Workers examples → Cloudflare Workers
- Pages examples → Cloudflare Pages
- Database examples → Workers with database bindings

### 5. URL Updates

After successful deployment, demo URLs are automatically updated in documentation frontmatter.

## Supported Products

- **Workers** - JavaScript/TypeScript edge functions
- **Pages** - Static site hosting with Functions
- **D1** - SQLite database examples (deployed as Workers)
- **Durable Objects** - Stateful serverless objects
- **KV** - Key-value storage examples

## Generated Workflows

The system creates these workflow files:

- `deploy-workers-demos.yml` - Deploys Workers examples
- `deploy-pages-demos.yml` - Deploys Pages examples
- `deploy-d1-demos.yml` - Deploys D1 database examples
- `deploy-durable-objects-demos.yml` - Deploys Durable Objects examples
- `deploy-kv-demos.yml` - Deploys KV storage examples

## Usage

### Manual Generation

```bash
# Generate all demo workflows
npm run generate:demo-workflows

# Generate demo projects for a specific product
npm run generate:demo-projects -- --product=workers

# Update demo URLs for a product
npm run update:demo-urls -- --product=workers
```

### Automatic Generation

The main workflow `generate-demo-workflows.yml` runs automatically when:
- Script files are modified
- Manually triggered via workflow_dispatch

## Configuration

### Example Metadata

Examples must include this frontmatter:

```yaml
---
type: example
title: "Example Title"
summary: "Brief description"
tags: ["tag1", "tag2"]
languages: ["JavaScript", "TypeScript"]
pcx_content_type: example
---
```

### Code Blocks

Examples should include deployable code:

````markdown
```typescript
export default {
  async fetch(request): Promise<Response> {
    return new Response("Hello World!");
  },
} satisfies ExportedHandler;
```
````

## Best Practices

1. **Example Quality** - Ensure examples are complete and deployable
2. **Code Formatting** - Use proper syntax highlighting in documentation
3. **Metadata Completeness** - Include all required frontmatter fields
4. **Testing** - Test examples locally before committing