import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const fixtureProject = fileURLToPath(new URL('./fixtures/strict/tsconfig.json', import.meta.url));
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

function typeCheckFixture(): { status: number; output: string } {
  try {
    execFileSync('npx', ['tsc', '-p', fixtureProject, '--noEmit'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { status: 0, output: '' };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return {
      status: failure.status ?? 1,
      output: `${failure.stdout ?? ''}${failure.stderr ?? ''}`,
    };
  }
}

describe('tsconfig strictness', () => {
  const result = typeCheckFixture();

  it('rejects the fixture', () => {
    expect(result.status).not.toBe(0);
  });

  it('reports the implicit any', () => {
    expect(result.output).toContain('TS7006');
  });

  it('reports the unused local', () => {
    expect(result.output).toContain('TS6133');
  });
});
