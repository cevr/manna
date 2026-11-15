/**
 * The declarations Exact's type check reads for the current Heartseed's
 * modules (`apps/heartseed/exact/*.d.ts`) say what each module's source
 * does: every name the port imports has the same type both ways, so a
 * changed signature fails this workspace's typecheck. The matcher's state
 * is opaque in its declaration, so its functions are held by their other
 * parameters and their views.
 */

import { expect, it } from 'bun:test';

import type * as DeclaredDay from '../../heartseed/exact/day.d.ts';
import type * as DeclaredMatcher from '../../heartseed/exact/matcher.d.ts';
import type * as DeclaredSayit from '../../heartseed/exact/sayit.d.ts';
import type * as DeclaredWords from '../../heartseed/exact/words.d.ts';
import type * as Day from '../../heartseed/src/day.ts';
import type * as Matcher from '../../heartseed/src/matcher.ts';
import type * as Words from '../../heartseed/src/matcher/words.ts';
import type * as Sayit from '../../heartseed/src/sayit.ts';

type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const DECLARED: readonly true[] = [
  true satisfies Mutual<
    Parameters<typeof Matcher.createMatcher>,
    Parameters<typeof DeclaredMatcher.createMatcher>
  >,
  true satisfies Mutual<
    ReturnType<typeof Matcher.matcherView>,
    ReturnType<typeof DeclaredMatcher.matcherView>
  >,
  true satisfies Mutual<
    Parameters<typeof Matcher.updateMatcher>[1],
    Parameters<typeof DeclaredMatcher.updateMatcher>[1]
  >,
  true satisfies Mutual<Matcher.Cue, DeclaredMatcher.Cue>,
  true satisfies Mutual<Matcher.Command, DeclaredMatcher.Command>,
  true satisfies Mutual<Matcher.MatcherView, DeclaredMatcher.MatcherView>,
  true satisfies Mutual<Matcher.SuggestedGrade, DeclaredMatcher.SuggestedGrade>,
  true satisfies Mutual<typeof Sayit.cappedBy, typeof DeclaredSayit.cappedBy>,
  true satisfies Mutual<typeof Sayit.recallOf, typeof DeclaredSayit.recallOf>,
  true satisfies Mutual<typeof Sayit.restPeeks, typeof DeclaredSayit.restPeeks>,
  true satisfies Mutual<typeof Sayit.PEEK_CAP, typeof DeclaredSayit.PEEK_CAP>,
  true satisfies Mutual<typeof Sayit.GRADES, typeof DeclaredSayit.GRADES>,
  true satisfies Mutual<typeof Sayit.GRADE_NAMES, typeof DeclaredSayit.GRADE_NAMES>,
  true satisfies Mutual<Sayit.Grade, DeclaredSayit.Grade>,
  true satisfies Mutual<Sayit.Help, DeclaredSayit.Help>,
  true satisfies Mutual<Sayit.Recall, DeclaredSayit.Recall>,
  true satisfies Mutual<typeof Words.sourceWords, typeof DeclaredWords.sourceWords>,
  true satisfies Mutual<typeof Day.offsetAt, typeof DeclaredDay.offsetAt>,
];

it("the current Heartseed's declarations for Exact say what its sources do", () => {
  expect(DECLARED.every((each) => each)).toBe(true);
});
