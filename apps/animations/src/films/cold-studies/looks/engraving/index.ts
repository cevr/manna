import type { Look } from '../../look.ts';
import { card } from './card.ts';
import { court } from './court.ts';
import { job } from './page.ts';

/** A print has no vignette: unlit, and none of the film's. */
export const engraving: Look = {
  court,
  job,
  card,
  light: { color: '#ffffff', amount: 0, vignette: 0 },
};
