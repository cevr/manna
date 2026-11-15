/**
 * The find bar's and the tiles' rules (`find-rules.ts`, pure, re-exported
 * here), and the app-wide tiles atom the home screen and the find bar read.
 */

import * as Atom from 'effect/reactivity/Atom';

import { Tiles } from './find-rules';

export * from './find-rules';

/** `All at once` on the home list, app-wide: the home screen shows it, and the find bar reads it. */
export const tiles = Atom.make<Tiles>(Tiles.Hidden()).pipe(Atom.keepAlive);
