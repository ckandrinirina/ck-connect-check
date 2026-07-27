import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

function readRepoFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');
}

const packageJson = JSON.parse(readRepoFile('package.json')) as {
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

describe('package.json', () => {
  it('declares test, build and lint scripts', () => {
    expect(packageJson.scripts?.test).toBeTruthy();
    expect(packageJson.scripts?.build).toBeTruthy();
    expect(packageJson.scripts?.lint).toBeTruthy();
  });

  it('depends on Electron and Vitest', () => {
    expect(packageJson.devDependencies).toHaveProperty('electron');
    expect(packageJson.devDependencies).toHaveProperty('vitest');
  });
});

describe('build config', () => {
  it('emits compiled output to dist/', () => {
    const buildConfig = JSON.parse(readRepoFile('tsconfig.build.json')) as {
      compilerOptions?: { noEmit?: boolean; outDir?: string };
    };
    expect(buildConfig.compilerOptions?.noEmit).toBe(false);
    expect(buildConfig.compilerOptions?.outDir).toBe('dist');
  });
});

describe('gitignore', () => {
  it('ignores build and dependency output', () => {
    const ignored = readRepoFile('.gitignore');
    for (const entry of ['node_modules/', 'dist/', 'out/']) {
      expect(ignored).toContain(entry);
    }
  });
});

describe('docs/ARCHITECTURE.md', () => {
  const commandsSection =
    readRepoFile('docs/ARCHITECTURE.md').split('## Commands')[1]?.split('\n## ')[0] ?? '';

  it('names the three scripts under ## Commands', () => {
    expect(commandsSection).toContain('npm test');
    expect(commandsSection).toContain('npm run build');
    expect(commandsSection).toContain('npm run lint');
  });

  it('no longer records a missing command', () => {
    expect(commandsSection).not.toMatch(/^\s*-\s*\w+:\s*\(none\)/m);
  });
});
