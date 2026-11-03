import type { Look } from '../../look.ts';
import { card } from './card.ts';
import { court } from './court.ts';
import { job } from './page.ts';

export const engraving: Look = {
  court,
  job,
  card,
  light: { color: '#ffffff', amount: 0, vignette: 0 },
};
