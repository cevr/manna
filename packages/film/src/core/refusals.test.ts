import { describe, expect, test } from 'bun:test';
import { SceneNotRendered } from './refusals.ts';

describe('a missing render', () => {
  test('names the render of its scene and variant', () => {
    const refused = SceneNotRendered.make({ film: 'rbf', scene: 'cold', variant: 'tight' });
    expect(refused.message).toContain('run film project render rbf --scene cold --variant tight');
  });
});
