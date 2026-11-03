import { type Hex, type Light, mix } from '@manna/film/canvas';
import { membersOf } from '@manna/film/core';
import { Result } from 'effect';
import { type ActName, look } from './acts.ts';
import { LIFT } from './palette.ts';
import { type BeatId, script } from './script.ts';

const VALLEY = 0.5;

const lit = (color: Hex, edge: Hex, share = 1): Light => {
  const lift = LIFT * share;
  const raised = mix(color, '#ffffff', lift / 2);
  return { color: raised, edge: mix(edge, raised, lift) };
};

export const LIGHT = {
  room: { ...lit('#fffcf5', '#f9f4ec'), vignette: 0 },
  dusk: lit('#f2f2f4', '#cccfd8'),
  haze: lit('#e6e8f0', '#aab2c8'),
  sunset: lit('#c8ac9a', '#3e3034', VALLEY),
  firstLight: lit('#d2ccc8', '#4a4652', VALLEY),
  morning: lit('#f0eadf', '#b6aa98'),
  day: lit('#f6f8f7', '#d6e0dd'),
} as const satisfies Record<string, Light>;

const byAct: Readonly<Record<ActName, Light>> = {
  verdict: LIGHT.room,
  seed: LIGHT.haze,
  gifts: LIGHT.dusk,
  grain: LIGHT.sunset,
  'still at work': LIGHT.morning,
  harvest: LIGHT.day,
};

const byScene: Partial<Record<BeatId, Light>> = {
  priest: LIGHT.firstLight,
  accuser: LIGHT.firstLight,
  robe: LIGHT.firstLight,
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
