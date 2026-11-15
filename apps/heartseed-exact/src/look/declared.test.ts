/**
 * The declarations Exact's type check reads for the current Heartseed's
 * theme, appearance, session lengths and voice choices
 * (`apps/heartseed/exact/{theme,appearance,session,reading}.d.ts`) say what
 * each source does: every name the port imports has the same type both
 * ways, so a changed signature fails this workspace's typecheck.
 */

import { expect, it } from 'bun:test';

import type * as DeclaredAppearance from '../../../heartseed/exact/appearance.d.ts';
import type * as DeclaredReading from '../../../heartseed/exact/reading.d.ts';
import type * as DeclaredSession from '../../../heartseed/exact/session.d.ts';
import type * as DeclaredTheme from '../../../heartseed/exact/theme.d.ts';
import type * as Appearance from '../../../heartseed/src/appearance.ts';
import type * as Session from '../../../heartseed/src/session.ts';
import type * as Theme from '../../../heartseed/src/theme.ts';
import type * as Reading from '../../../heartseed/src/voice/reading.ts';

type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const DECLARED: readonly true[] = [
  true satisfies Mutual<typeof Theme.theme, typeof DeclaredTheme.theme>,
  true satisfies Mutual<Theme.Roles, DeclaredTheme.Roles>,
  true satisfies Mutual<Theme.Scheme, DeclaredTheme.Scheme>,
  true satisfies Mutual<typeof Appearance.APPEARANCES, typeof DeclaredAppearance.APPEARANCES>,
  true satisfies Mutual<typeof Appearance.appearanceOf, typeof DeclaredAppearance.appearanceOf>,
  true satisfies Mutual<typeof Appearance.schemeOf, typeof DeclaredAppearance.schemeOf>,
  true satisfies Mutual<Appearance.Choice, DeclaredAppearance.Choice>,
  true satisfies Mutual<typeof Session.MINUTES, typeof DeclaredSession.MINUTES>,
  true satisfies Mutual<Session.Minutes, DeclaredSession.Minutes>,
  true satisfies Mutual<typeof Reading.CHOICES, typeof DeclaredReading.CHOICES>,
  true satisfies Mutual<Reading.Choice, DeclaredReading.Choice>,
];

it("the current Heartseed's declarations for its look and choices say what its sources do", () => {
  expect(DECLARED.every((each) => each)).toBe(true);
});
