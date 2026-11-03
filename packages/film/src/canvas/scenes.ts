import type { Beat } from '../core/schema.ts';
import type { SceneSpec } from './film.ts';
import { type CardType, storyboard } from './storyboard.ts';

type SceneDrawing = Pick<SceneSpec, 'draw' | 'timeline' | 'knobs' | 'drift' | 'light' | 'cards'>;

type SceneLight = NonNullable<SceneSpec['light']>;

interface SceneParts<Id extends string> {
  readonly drawings: { readonly [K in Id]?: SceneDrawing };
  readonly light?: (id: Id) => SceneLight | undefined;
  readonly card: CardType;
}

export const scenesOf = <Id extends string>(
  script: ReadonlyArray<Beat & { readonly id: Id }>,
  parts: SceneParts<Id>,
): SceneSpec[] =>
  script.map(({ cite: _cite, picture, ...timed }) => {
    const drawn: Omit<SceneSpec, 'id' | 'say'> =
      parts.drawings[timed.id] ?? storyboard(timed.id, picture, parts.card);
    const scene: SceneSpec = { ...drawn, ...timed };
    const light = drawn.light ?? parts.light?.(timed.id);
    if (light !== undefined) return { ...scene, light };
    return scene;
  });
