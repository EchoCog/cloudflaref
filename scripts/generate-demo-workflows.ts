#!/usr/bin/env tsx

/**
 * Script to generate GitHub Actions workflows for feature demos
 * based on documentation content.
 */

import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import matter from 'gray-matter';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ExampleMetadata {
  title: string;
  type: string;
  summary?: string;
  demo?: string;
  tags?: string[];
  languages?: string[];
  pcx_content_type: string;
  sidebar?: {
    order?: number;
  };
}

interface DemoExample {
  filepath: string;
  metadata: ExampleMetadata;
  content: string;
  codeBlocks: CodeBlock[];
}

interface CodeBlock {
  language: string;
  code: string;
  filename?: string;
}

interface GeneratedWorkflow {
  name: string;
  product: string;
  examples: DemoExample[];
  workflowContent: string;
}

class DemoWorkflowGenerator {
  private readonly docsPath = join(dirname(__dirname), 'src/content/docs');
  private readonly workflowsPath = join(dirname(__dirname), '.github/workflows');
  private readonly generatedPath = join(this.workflowsPath, 'generated-demos');

  async run(): Promise<void> {
    console.log('🚀 Starting demo workflow generation...');

    // Find all example files
    const examples = await this.findExampleFiles();
    console.log(`📁 Found ${examples.length} example files`);

    // Group examples by product
    const groupedExamples = this.groupExamplesByProduct(examples);
    console.log(`📦 Grouped into ${Object.keys(groupedExamples).length} products`);

    // Generate workflows for each product
    const workflows: GeneratedWorkflow[] = [];
    for (const [product, productExamples] of Object.entries(groupedExamples)) {
      if (productExamples.length > 0) {
        const workflow = await this.generateWorkflowForProduct(product, productExamples);
        if (workflow) {
          workflows.push(workflow);
        }
      }
    }

    // Write workflow files
    await this.writeWorkflows(workflows);

    console.log(`✅ Generated ${workflows.length} demo workflows`);
  }

  private async findExampleFiles(): Promise<DemoExample[]> {
    const examples: DemoExample[] = [];
    const productDirs = await readdir(this.docsPath, { withFileTypes: true });

    for (const productDir of productDirs) {
      if (productDir.isDirectory()) {
        const productPath = join(this.docsPath, productDir.name);
        await this.scanDirectoryForExamples(productPath, examples);
      }
    }

    return examples;
  }

  private async scanDirectoryForExamples(dirPath: string, examples: DemoExample[]): Promise<void> {
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          await this.scanDirectoryForExamples(fullPath, examples);
        } else if (entry.name.endsWith('.mdx') || entry.name.endsWith('.md')) {
          const example = await this.parseExampleFile(fullPath);
          if (example && this.isValidExample(example)) {
            examples.push(example);
          }
        }
      }
    } catch (error) {
      // Skip directories we can't read
      console.warn(`⚠️  Could not read directory: ${dirPath}`);
    }
  }

  private async parseExampleFile(filepath: string): Promise<DemoExample | null> {
    try {
      const content = await readFile(filepath, 'utf-8');
      const { data: metadata, content: markdownContent } = matter(content);

      // Extract code blocks
      const codeBlocks = this.extractCodeBlocks(markdownContent);

      return {
        filepath,
        metadata: metadata as ExampleMetadata,
        content: markdownContent,
        codeBlocks,
      };
    } catch (error) {
      console.warn(`⚠️  Could not parse file: ${filepath}`, error);
      return null;
    }
  }

  private extractCodeBlocks(content: string): CodeBlock[] {
    const codeBlocks: CodeBlock[] = [];
    const codeBlockRegex = /```(\w+)(?:\s+title="([^"]+)")?\n([\s\S]*?)```/g;
    
    let match;
    while ((match = codeBlockRegex.exec(content)) !== null) {
      const [, language, filename, code] = match;
      codeBlocks.push({
        language,
        code: code.trim(),
        filename,
      });
    }

    return codeBlocks;
  }

  private isValidExample(example: DemoExample): boolean {
    const { metadata, codeBlocks } = example;
    
    // Must be an example type
    if (metadata.type !== 'example') {
      return false;
    }

    // Must have deployable code (JavaScript, TypeScript, Python, etc.)
    const hasDeployableCode = codeBlocks.some(block => 
      ['javascript', 'js', 'typescript', 'ts', 'python', 'py'].includes(block.language.toLowerCase())
    );

    return hasDeployableCode;
  }

  private groupExamplesByProduct(examples: DemoExample[]): Record<string, DemoExample[]> {
    const grouped: Record<string, DemoExample[]> = {};

    for (const example of examples) {
      // Extract product from filepath
      const pathParts = example.filepath.split('/');
      const docsIndex = pathParts.findIndex(part => part === 'docs');
      const product = docsIndex >= 0 && pathParts[docsIndex + 1] ? pathParts[docsIndex + 1] : 'misc';

      if (!grouped[product]) {
        grouped[product] = [];
      }
      grouped[product].push(example);
    }

    return grouped;
  }

  private async generateWorkflowForProduct(product: string, examples: DemoExample[]): Promise<GeneratedWorkflow | null> {
    // Focus on products with good CI/CD potential
    const supportedProducts = ['workers', 'pages', 'd1', 'r2', 'durable-objects', 'kv'];
    
    if (!supportedProducts.includes(product)) {
      console.log(`⏭️  Skipping ${product} (not yet supported for auto-deployment)`);
      return null;
    }

    const workflowContent = this.generateWorkflowYaml(product, examples);

    return {
      name: `deploy-${product}-demos`,
      product,
      examples,
      workflowContent,
    };
  }

  private generateWorkflowYaml(product: string, examples: DemoExample[]): string {
    const workflowName = `Deploy ${product.charAt(0).toUpperCase() + product.slice(1)} Demos`;
    
    return `name: ${workflowName}

on:
  push:
    branches: [production]
    paths:
      - 'src/content/docs/${product}/**'
  workflow_dispatch:

concurrency:
  group: \${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  deploy-demos:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      deployments: write
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Generate demo projects
        run: npx tsx scripts/generate-demo-projects.ts --product=${product}
        
      - name: Deploy ${product} demos
        env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: \${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: |
${this.generateDeploySteps(product, examples)}

  update-demo-links:
    needs: deploy-demos
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        
      - name: Update demo URLs in documentation
        run: npx tsx scripts/update-demo-urls.ts --product=${product}
        
      - name: Commit demo URL updates
        uses: stefanzweifel/git-auto-commit-action@v5
        with:
          commit_message: "Update ${product} demo URLs [auto-generated]"
          file_pattern: "src/content/docs/${product}/**/*.mdx"
        continue-on-error: true
`;
  }

  private generateDeploySteps(product: string, examples: DemoExample[]): string {
    const steps: string[] = [];
    
    for (const example of examples) {
      const exampleName = this.getExampleName(example);
      steps.push(`          # Deploy ${example.metadata.title}`);
      
      if (product === 'workers') {
        steps.push(`          cd generated-demos/${product}/${exampleName}`);
        steps.push(`          npx wrangler deploy --name=${product}-demo-${exampleName}`);
        steps.push(`          cd ../../..`);
      } else if (product === 'pages') {
        steps.push(`          cd generated-demos/${product}/${exampleName}`);
        steps.push(`          npx wrangler pages deploy dist --project-name=${product}-demo-${exampleName}`);
        steps.push(`          cd ../../..`);
      }
      steps.push('');
    }
    
    return steps.join('\n');
  }

  private getExampleName(example: DemoExample): string {
    const filename = example.filepath.split('/').pop()?.replace(/\.mdx?$/, '') || 'example';
    return filename.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  }

  private async writeWorkflows(workflows: GeneratedWorkflow[]): Promise<void> {
    // Ensure the generated workflows directory exists
    if (!existsSync(this.generatedPath)) {
      await mkdir(this.generatedPath, { recursive: true });
    }

    for (const workflow of workflows) {
      const workflowFile = join(this.generatedPath, `${workflow.name}.yml`);
      await writeFile(workflowFile, workflow.workflowContent, 'utf-8');
      console.log(`📝 Created workflow: ${workflowFile}`);
    }

    // Create a summary file
    const summary = {
      generated_at: new Date().toISOString(),
      workflows: workflows.map(w => ({
        name: w.name,
        product: w.product,
        example_count: w.examples.length,
        examples: w.examples.map(e => ({
          title: e.metadata.title,
          file: e.filepath.replace(dirname(__dirname), ''),
          languages: e.metadata.languages || [],
        })),
      })),
    };

    const summaryFile = join(this.generatedPath, 'summary.json');
    await writeFile(summaryFile, JSON.stringify(summary, null, 2), 'utf-8');
    console.log(`📊 Created summary: ${summaryFile}`);
  }
}

// Run the generator
if (import.meta.url === `file://${process.argv[1]}`) {
  const generator = new DemoWorkflowGenerator();
  generator.run().catch(console.error);
}

export { DemoWorkflowGenerator };