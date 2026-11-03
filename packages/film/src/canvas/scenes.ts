import type { Beat } from '../core/schema.ts';
import type { SceneSpec } from './film.ts';
import { type CardType, storyboard } from './storyboard.ts';

/** What a drawing gives its scene: its picture, the cues and knobs it reads, its breath, its light and its full-screen cards. */
type SceneDrawing = Pick<SceneSpec, 'draw' | 'timeline' | 'knobs' | 'drift' | 'light' | 'cards'>;

/** A scene's light, fixed or read from its frame. */
type SceneLight = NonNullable<SceneSpec['light']>;

/** What a film pairs its beats with, keyed by the beats' ids. */
interface SceneParts<Id extends string> {
  readonly drawings: { readonly [K in Id]?: SceneDrawing };
  /** The light of a beat whose drawing brings none: its act's. None leaves it unlit. */
  readonly light?: (id: Id) => SceneLight | undefined;
  /** How a storyboard card sets its brief and its label. */
  readonly card: CardType;
}

/**
 * The film's scenes, in script order. The script's timing is spread last, so
 * a storyboard card's own entrance holds only where the script names none.
 */
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
