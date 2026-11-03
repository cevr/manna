import type { Light } from '@manna/film/canvas';
import { membersOf } from '@manna/film/core';
import { Result } from 'effect';
import { LIGHT } from '../light.ts';
import { type ActName, look } from './acts.ts';
import { type BeatId, script } from './script.ts';

/** Each act's light (`acts.ts` declares the acts and the scenes they hold). */
const byAct: Readonly<Record<ActName, Light>> = {
  'cold open': LIGHT.room,
  message: LIGHT.dusk,
  faith: LIGHT.haze,
  forgiveness: LIGHT.sunset,
  power: LIGHT.morning,
  landing: LIGHT.day,
};

/**
 * The scenes lit apart from their act: the valley's court at first light. A
 * light that changes on a scene's own cue (`robe`'s dawn as the loom weaves)
 * is that drawing's `light`, typed by its cues.
 */
const byScene: Partial<Record<BeatId, Light>> = {
  accuser: LIGHT.firstLight,
};

/** Each scene's act light. */
const byActOf: ReadonlyMap<string, Light> = new Map(
  Result.getOrThrow(
    membersOf(
      look.acts,
      script.map((beat) => beat.id),
    ),
  ).flatMap(({ part, scenes }) => scenes.map((id) => [id, byAct[part.name]] as const)),
);

/** A scene's light, where its drawing brings none: its own where `byScene` names one, else its act's. */
export const lightOf = (id: BeatId): Light | undefined => byScene[id] ?? byActOf.get(id);
