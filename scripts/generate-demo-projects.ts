#!/usr/bin/env tsx

/**
 * Script to generate actual demo projects from documentation examples
 */

import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import matter from 'gray-matter';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface CodeBlock {
  language: string;
  code: string;
  filename?: string;
}

interface ExampleMetadata {
  title: string;
  type: string;
  summary?: string;
  demo?: string;
  tags?: string[];
  languages?: string[];
}

interface DemoExample {
  filepath: string;
  metadata: ExampleMetadata;
  content: string;
  codeBlocks: CodeBlock[];
}

class DemoProjectGenerator {
  private readonly docsPath = join(dirname(__dirname), 'src/content/docs');
  private readonly outputPath = join(dirname(__dirname), 'generated-demos');

  async generateForProduct(product: string): Promise<void> {
    console.log(`🚀 Generating demo projects for ${product}...`);

    // Find examples for the product
    const examples = await this.findExamplesForProduct(product);
    console.log(`📁 Found ${examples.length} examples for ${product}`);

    // Create output directory
    const productOutputPath = join(this.outputPath, product);
    if (!existsSync(productOutputPath)) {
      await mkdir(productOutputPath, { recursive: true });
    }

    // Generate project for each example
    for (const example of examples) {
      await this.generateProjectForExample(example, productOutputPath);
    }

    console.log(`✅ Generated ${examples.length} demo projects for ${product}`);
  }

  private async findExamplesForProduct(product: string): Promise<DemoExample[]> {
    const examples: DemoExample[] = [];
    const productPath = join(this.docsPath, product);

    if (existsSync(productPath)) {
      await this.scanDirectoryForExamples(productPath, examples);
    }

    return examples.filter(example => 
      example.metadata.type === 'example' && 
      example.codeBlocks.some(block => 
        ['javascript', 'js', 'typescript', 'ts', 'python', 'py'].includes(block.language.toLowerCase())
      )
    );
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
          if (example) {
            examples.push(example);
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️  Could not read directory: ${dirPath}`);
    }
  }

  private async parseExampleFile(filepath: string): Promise<DemoExample | null> {
    try {
      const content = await readFile(filepath, 'utf-8');
      const { data: metadata, content: markdownContent } = matter(content);

      const codeBlocks = this.extractCodeBlocks(markdownContent);

      return {
        filepath,
        metadata: metadata as ExampleMetadata,
        content: markdownContent,
        codeBlocks,
      };
    } catch (error) {
      console.warn(`⚠️  Could not parse file: ${filepath}`);
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

  private async generateProjectForExample(example: DemoExample, outputPath: string): Promise<void> {
    const exampleName = this.getExampleName(example);
    const projectPath = join(outputPath, exampleName);

    // Create project directory
    if (!existsSync(projectPath)) {
      await mkdir(projectPath, { recursive: true });
    }

    // Find the main code block (TypeScript/JavaScript preferred)
    const mainCodeBlock = this.findMainCodeBlock(example.codeBlocks);
    if (!mainCodeBlock) {
      console.warn(`⚠️  No deployable code found for ${example.metadata.title}`);
      return;
    }

    // Generate project files based on the product
    const product = this.getProductFromPath(example.filepath);
    await this.generateProjectFiles(projectPath, product, example, mainCodeBlock);

    console.log(`📝 Generated project: ${exampleName}`);
  }

  private findMainCodeBlock(codeBlocks: CodeBlock[]): CodeBlock | null {
    // Prefer TypeScript, then JavaScript, then Python
    const priorities = ['typescript', 'ts', 'javascript', 'js', 'python', 'py'];
    
    for (const lang of priorities) {
      const block = codeBlocks.find(block => block.language.toLowerCase() === lang);
      if (block) return block;
    }

    return null;
  }

  private getProductFromPath(filepath: string): string {
    const pathParts = filepath.split('/');
    const docsIndex = pathParts.findIndex(part => part === 'docs');
    return docsIndex >= 0 && pathParts[docsIndex + 1] ? pathParts[docsIndex + 1] : 'misc';
  }

  private async generateProjectFiles(
    projectPath: string,
    product: string,
    example: DemoExample,
    mainCodeBlock: CodeBlock
  ): Promise<void> {
    switch (product) {
      case 'workers':
        await this.generateWorkersProject(projectPath, example, mainCodeBlock);
        break;
      case 'pages':
        await this.generatePagesProject(projectPath, example, mainCodeBlock);
        break;
      case 'd1':
      case 'durable-objects':
      case 'kv':
        // These typically use Workers runtime
        await this.generateWorkersProject(projectPath, example, mainCodeBlock);
        break;
      default:
        console.warn(`⚠️  Unknown product type: ${product}`);
    }
  }

  private async generateWorkersProject(
    projectPath: string,
    example: DemoExample,
    mainCodeBlock: CodeBlock
  ): Promise<void> {
    // Generate wrangler.toml
    const wranglerConfig = `name = "demo-${this.getExampleName(example)}"
main = "src/index.${mainCodeBlock.language === 'typescript' || mainCodeBlock.language === 'ts' ? 'ts' : 'js'}"
compatibility_date = "2024-01-15"
compatibility_flags = ["nodejs_compat"]

[[rules]]
type = "ESModule"
globs = ["**/*.js", "**/*.mjs", "**/*.ts"]
`;

    await writeFile(join(projectPath, 'wrangler.toml'), wranglerConfig);

    // Generate package.json
    const packageJson = {
      name: `demo-${this.getExampleName(example)}`,
      private: true,
      type: "module",
      scripts: {
        deploy: "wrangler deploy",
        dev: "wrangler dev"
      },
      devDependencies: {
        "@cloudflare/workers-types": "^4.20250718.0",
        wrangler: "^3.0.0"
      }
    };

    if (mainCodeBlock.language === 'typescript' || mainCodeBlock.language === 'ts') {
      (packageJson.devDependencies as any)['typescript'] = '^5.0.0';
    }

    await writeFile(join(projectPath, 'package.json'), JSON.stringify(packageJson, null, 2));

    // Generate TypeScript config if needed
    if (mainCodeBlock.language === 'typescript' || mainCodeBlock.language === 'ts') {
      const tsConfig = {
        extends: "@cloudflare/workers-types/tsconfig.json",
        compilerOptions: {
          types: ["@cloudflare/workers-types"]
        }
      };
      await writeFile(join(projectPath, 'tsconfig.json'), JSON.stringify(tsConfig, null, 2));
    }

    // Create src directory and main file
    const srcPath = join(projectPath, 'src');
    if (!existsSync(srcPath)) {
      await mkdir(srcPath, { recursive: true });
    }

    const extension = mainCodeBlock.language === 'typescript' || mainCodeBlock.language === 'ts' ? 'ts' : 'js';
    await writeFile(join(srcPath, `index.${extension}`), mainCodeBlock.code);

    // Generate README
    const readme = `# ${example.metadata.title}

${example.metadata.summary || ''}

## Deploy

\`\`\`bash
npm install
npm run deploy
\`\`\`

## Development

\`\`\`bash
npm run dev
\`\`\`

---

Generated from: ${example.filepath}
`;

    await writeFile(join(projectPath, 'README.md'), readme);
  }

  private async generatePagesProject(
    projectPath: string,
    example: DemoExample,
    mainCodeBlock: CodeBlock
  ): Promise<void> {
    // Generate package.json for Pages
    const packageJson = {
      name: `demo-${this.getExampleName(example)}`,
      private: true,
      type: "module",
      scripts: {
        build: "echo 'Build step placeholder'",
        deploy: "wrangler pages deploy dist",
        dev: "wrangler pages dev dist"
      },
      devDependencies: {
        wrangler: "^3.0.0"
      }
    };

    await writeFile(join(projectPath, 'package.json'), JSON.stringify(packageJson, null, 2));

    // Create dist directory with a simple HTML file
    const distPath = join(projectPath, 'dist');
    if (!existsSync(distPath)) {
      await mkdir(distPath, { recursive: true });
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${example.metadata.title}</title>
</head>
<body>
    <h1>${example.metadata.title}</h1>
    <p>${example.metadata.summary || ''}</p>
    <pre><code>${mainCodeBlock.code}</code></pre>
</body>
</html>`;

    await writeFile(join(distPath, 'index.html'), html);

    // Generate README
    const readme = `# ${example.metadata.title}

${example.metadata.summary || ''}

## Deploy

\`\`\`bash
npm install
npm run deploy
\`\`\`

---

Generated from: ${example.filepath}
`;

    await writeFile(join(projectPath, 'README.md'), readme);
  }

  private getExampleName(example: DemoExample): string {
    const filename = example.filepath.split('/').pop()?.replace(/\.mdx?$/, '') || 'example';
    return filename.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const productArg = args.find(arg => arg.startsWith('--product='));
  
  if (!productArg) {
    console.error('❌ Please specify a product with --product=<product>');
    process.exit(1);
  }

  const product = productArg.split('=')[1];
  const generator = new DemoProjectGenerator();
  
  try {
    await generator.generateForProduct(product);
  } catch (error) {
    console.error(`❌ Error generating demos for ${product}:`, error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { DemoProjectGenerator };