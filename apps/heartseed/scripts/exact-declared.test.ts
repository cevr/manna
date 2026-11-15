/**
 * The declarations Exact's type check reads for the modules the Exact port
 * imports (`exact/*.d.ts`, the `types` of this package's exports) say what
 * the sources do: each declared name's type and its source's are assignable
 * both ways, so a changed signature fails this workspace's typecheck. The
 * imports are types alone, so the test loads none of the modules.
 */

import { expect, it } from 'bun:test';

import type * as DeclaredChooser from '../exact/chooser.d.ts';
import type * as DeclaredDay from '../exact/day.d.ts';
import type * as DeclaredFsrs from '../exact/fsrs.d.ts';
import type * as DeclaredGarden from '../exact/garden.d.ts';
import type * as DeclaredLists from '../exact/lists.d.ts';
import type * as DeclaredPassages from '../exact/passages.d.ts';
import type * as DeclaredSayIt from '../exact/sayit.d.ts';
import type * as Chooser from '../src/chooser';
import type * as Day from '../src/day';
import type * as Fsrs from '../src/fsrs';
import type * as Garden from '../src/garden';
import type * as Lists from '../src/lists';
import type * as Passages from '../src/passages';
import type * as SayIt from '../src/sayit';

/** Whether `A` and `B` are each assignable to the other. */
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const DECLARED: readonly true[] = [
  true satisfies Mutual<typeof Chooser.LIMIT_LINE, typeof DeclaredChooser.LIMIT_LINE>,
  true satisfies Mutual<typeof Day.dayOf, typeof DeclaredDay.dayOf>,
  true satisfies Mutual<Fsrs.Card, DeclaredFsrs.Card>,
  true satisfies Mutual<Fsrs.Grade, DeclaredFsrs.Grade>,
  true satisfies Mutual<typeof Fsrs.review, typeof DeclaredFsrs.review>,
  true satisfies Mutual<SayIt.Recall, DeclaredSayIt.Recall>,
  true satisfies Mutual<SayIt.Help, DeclaredSayIt.Help>,
  true satisfies Mutual<typeof SayIt.Recalls, typeof DeclaredSayIt.Recalls>,
  true satisfies Mutual<typeof SayIt.PEEK_CAP, typeof DeclaredSayIt.PEEK_CAP>,
  true satisfies Mutual<typeof SayIt.cappedBy, typeof DeclaredSayIt.cappedBy>,
  true satisfies Mutual<Garden.Stage, DeclaredGarden.Stage>,
  true satisfies Mutual<Garden.Plant, DeclaredGarden.Plant>,
  true satisfies Mutual<Garden.GardenView, DeclaredGarden.GardenView>,
  true satisfies Mutual<Garden.BackAsk, DeclaredGarden.BackAsk>,
  true satisfies Mutual<Garden.BackAnswer, DeclaredGarden.BackAnswer>,
  true satisfies Mutual<typeof Garden.stageOf, typeof DeclaredGarden.stageOf>,
  true satisfies Mutual<typeof Garden.backOf, typeof DeclaredGarden.backOf>,
  true satisfies Mutual<typeof Garden.shownAllCap, typeof DeclaredGarden.shownAllCap>,
  true satisfies Mutual<typeof Garden.withHelp, typeof DeclaredGarden.withHelp>,
  true satisfies Mutual<typeof Garden.Chime, typeof DeclaredGarden.Chime>,
  true satisfies Mutual<typeof Garden.Garden, typeof DeclaredGarden.Garden>,
  true satisfies Mutual<typeof Garden.Backs, typeof DeclaredGarden.Backs>,
  true satisfies Mutual<typeof Garden.layer, typeof DeclaredGarden.layer>,
  true satisfies Mutual<typeof Passages.PASSAGES_KEY, typeof DeclaredPassages.PASSAGES_KEY>,
  true satisfies Mutual<typeof Passages.LISTS_KEY, typeof DeclaredPassages.LISTS_KEY>,
  true satisfies Mutual<typeof Passages.MOST_PASSAGES, typeof DeclaredPassages.MOST_PASSAGES>,
  true satisfies Mutual<typeof Passages.MOST_VERSES, typeof DeclaredPassages.MOST_VERSES>,
  true satisfies Mutual<Passages.Range, DeclaredPassages.Range>,
  true satisfies Mutual<Passages.PassagesView, DeclaredPassages.PassagesView>,
  true satisfies Mutual<Passages.AddAnswer, DeclaredPassages.AddAnswer>,
  true satisfies Mutual<Passages.RemoveAnswer, DeclaredPassages.RemoveAnswer>,
  true satisfies Mutual<Passages.PlantAnswer, DeclaredPassages.PlantAnswer>,
  true satisfies Mutual<typeof Passages.inChapter, typeof DeclaredPassages.inChapter>,
  true satisfies Mutual<typeof Passages.choosable, typeof DeclaredPassages.choosable>,
  true satisfies Mutual<typeof Passages.verseReference, typeof DeclaredPassages.verseReference>,
  true satisfies Mutual<typeof Passages.passageReference, typeof DeclaredPassages.passageReference>,
  true satisfies Mutual<typeof Passages.Passages, typeof DeclaredPassages.Passages>,
  true satisfies Mutual<typeof Passages.layer, typeof DeclaredPassages.layer>,
  true satisfies Mutual<Lists.List, DeclaredLists.List>,
  true satisfies Mutual<typeof Lists.placeOf, typeof DeclaredLists.placeOf>,
  true satisfies Mutual<typeof Lists.versesIn, typeof DeclaredLists.versesIn>,
  true satisfies Mutual<typeof Lists.listsOf, typeof DeclaredLists.listsOf>,
];

it('declares for Exact what each module the port imports exports', () => {
  expect(DECLARED.every((each) => each)).toBe(true);
});
