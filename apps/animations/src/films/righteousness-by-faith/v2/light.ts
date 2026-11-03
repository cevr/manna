import type { Light } from '@manna/film/canvas';
import { membersOf } from '@manna/film/core';
import { Result } from 'effect';
import { LIGHT } from '../light.ts';
import { type ActName, look } from './acts.ts';
import { type BeatId, script } from './script.ts';

const byAct: Readonly<Record<ActName, Light>> = {
  'cold open': LIGHT.room,
  message: LIGHT.dusk,
  faith: LIGHT.haze,
  forgiveness: LIGHT.sunset,
  power: LIGHT.morning,
  landing: LIGHT.day,
};

const byScene: Partial<Record<BeatId, Light>> = {
  accuser: LIGHT.firstLight,
};

const byActOf: ReadonlyMap<string, Light> = new Map(
  Result.getOrThrow(
    membersOf(
      look.acts,
      script.map((beat) => beat.id),
    ),
  ).flatMap(({ part, scenes }) => scenes.map((id) => [id, byAct[part.name]] as const)),
);

export const lightOf = (id: BeatId): Light | undefined => byScene[id] ?? byActOf.get(id);
