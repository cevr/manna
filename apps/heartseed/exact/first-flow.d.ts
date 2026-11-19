import type { Option } from 'effect';

import type { GardenView } from './garden.d.ts';

/** The screen a launch opens on: none while the garden's read runs, the first minute when the read holds no plant, home when it holds one, and Today in an unread garden. */
export type Opening = 'pending' | 'first' | 'home' | 'today';

/** The screen a launch on `garden` opens on. */
export declare const openingOf: (garden: Option.Option<GardenView>) => Opening;
