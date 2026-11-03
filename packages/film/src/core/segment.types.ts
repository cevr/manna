import type { Address } from './address-schema.ts';
import { BoardName, PANEL_START, styleFile, tryFile } from './board.ts';
import type { Library } from './sfx.ts';

declare const library: Library;

// @ts-expect-error a try's file built from a beat no decode passed
export const bareBeat = tryFile('cold', PANEL_START, 1);

// @ts-expect-error a style's file built from an id no decode passed
export const bareStyle = styleFile('9005', 'png');

// @ts-expect-error an act's address (its render folder) named by a bare string
export const bareAct: Address = { _tag: 'Act', act: 'cold open' };

// @ts-expect-error a library read by a bare string: `constructor` would read the prototype's
export const bareSound = library['paper.slide'];

/** A try's file from decoded names. */
export const named = tryFile(BoardName.make('cold'), PANEL_START, 1);
