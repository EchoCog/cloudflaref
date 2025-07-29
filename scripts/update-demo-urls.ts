#!/usr/bin/env tsx

/**
 * Script to update demo URLs in documentation files after deployment
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import matter from 'gray-matter';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ExampleMetadata {
  title: string;
  type: string;
  demo?: string;
  [key: string]: any;
}

class DemoUrlUpdater {
  private readonly docsPath = join(dirname(__dirname), 'src/content/docs');
  private readonly baseUrl = 'https://demo.developers.cloudflare.com'; // Placeholder base URL

  async updateForProduct(product: string): Promise<void> {
    console.log(`🔗 Updating demo URLs for ${product}...`);

    const productPath = join(this.docsPath, product);
    if (!existsSync(productPath)) {
      console.warn(`⚠️  Product directory not found: ${productPath}`);
      return;
    }

    const updatedFiles: string[] = [];
    await this.updateDirectoryFiles(productPath, product, updatedFiles);

    console.log(`✅ Updated ${updatedFiles.length} files with new demo URLs`);
    updatedFiles.forEach(file => console.log(`  📝 ${file}`));
  }

  private async updateDirectoryFiles(
    dirPath: string,
    product: string,
    updatedFiles: string[]
  ): Promise<void> {
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          await this.updateDirectoryFiles(fullPath, product, updatedFiles);
        } else if (entry.name.endsWith('.mdx') || entry.name.endsWith('.md')) {
          const wasUpdated = await this.updateExampleFile(fullPath, product);
          if (wasUpdated) {
            updatedFiles.push(fullPath);
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️  Could not read directory: ${dirPath}`);
    }
  }

  private async updateExampleFile(filepath: string, product: string): Promise<boolean> {
    try {
      const content = await readFile(filepath, 'utf-8');
      const { data: metadata, content: markdownContent } = matter(content);

      // Check if this is an example file
      if (metadata.type !== 'example') {
        return false;
      }

      // Generate demo URL
      const exampleName = this.getExampleName(filepath);
      const newDemoUrl = `${this.baseUrl}/${product}/${exampleName}`;

      // Check if we need to update
      const currentDemoUrl = metadata.demo;
      if (currentDemoUrl === newDemoUrl) {
        return false; // No update needed
      }

      // Update metadata
      const updatedMetadata = {
        ...metadata,
        demo: newDemoUrl
      };

      // Reconstruct the file
      const updatedContent = matter.stringify(markdownContent, updatedMetadata);
      await writeFile(filepath, updatedContent, 'utf-8');

      console.log(`🔗 Updated demo URL for "${metadata.title}": ${newDemoUrl}`);
      return true;

    } catch (error) {
      console.warn(`⚠️  Could not update file: ${filepath}`, error);
      return false;
    }
  }

  private getExampleName(filepath: string): string {
    const filename = filepath.split('/').pop()?.replace(/\.mdx?$/, '') || 'example';
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
  const updater = new DemoUrlUpdater();
  
  try {
    await updater.updateForProduct(product);
  } catch (error) {
    console.error(`❌ Error updating demo URLs for ${product}:`, error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { DemoUrlUpdater };