import { describe, expect, test } from 'bun:test';
import film from '../../../package.json' with { type: 'json' };
import turbo from '../../../turbo.json' with { type: 'json' };
import { E2E_TIMEOUT_MS } from './test-timeout.ts';

const scripts: Readonly<Record<string, string>> = film.scripts;
const parts = turbo.tasks.test.dependsOn.filter((task) => task !== '$TURBO_EXTENDS$');

describe("the tests' time limits", () => {
  test('each part of the test script names no --timeout: its limit is bun’s own', () => {
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.map((part) => [part, scripts[part]?.startsWith('bun test ')])).toEqual(
      parts.map((part) => [part, true]),
    );
    expect(parts.filter((part) => scripts[part]?.includes('--timeout'))).toEqual([]);
  });

  test('the test:e2e script preloads the browser limit and passes it as --timeout', () => {
    expect(film.scripts['test:e2e']).toContain(' --preload ./e2e/preload.ts ');
    expect(film.scripts['test:e2e']).toContain(` --timeout ${E2E_TIMEOUT_MS} `);
  });
});
