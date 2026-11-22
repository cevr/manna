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
import type * as DeclaredKjv from '../exact/kjv.d.ts';
import type * as DeclaredLists from '../exact/lists.d.ts';
import type * as DeclaredPassages from '../exact/passages.d.ts';
import type * as DeclaredSayIt from '../exact/sayit.d.ts';
import type * as DeclaredDictation from '../exact/dictation.d.ts';
import type * as DeclaredGrown from '../exact/grown.d.ts';
import type * as DeclaredField from '../exact/field.d.ts';
import type * as DeclaredHome from '../exact/home.d.ts';
import type * as DeclaredHomeToday from '../exact/home-today.d.ts';
import type * as DeclaredHomeStart from '../exact/home-start.d.ts';
import type * as DeclaredList from '../exact/list.d.ts';
import type * as DeclaredShelves from '../exact/shelves.d.ts';
import type * as Field from '../src/field';
import type * as Shelves from '../src/shelves';
import type * as Home from '../src/home';
import type * as HomeToday from '../src/home/today';
import type * as HomeStart from '../src/home/start';
import type * as List from '../src/list';
import type * as DeclaredLetters from '../exact/letters.d.ts';
import type * as DeclaredSayItMotion from '../exact/sayit-motion.d.ts';
import type * as DeclaredHomeMotion from '../exact/home-motion.d.ts';
import type * as SayItMotion from '../src/sayit/motion';
import type * as HomeMotion from '../src/home/motion';
import type * as DeclaredRun from '../exact/session-run.d.ts';
import type * as DeclaredService from '../exact/session-service.d.ts';
import type * as DeclaredSession from '../exact/session.d.ts';
import type * as DeclaredVoice from '../exact/voice.d.ts';
import type * as Dictation from '../src/dictation';
import type * as Grown from '../src/home/grown';
import type * as Promises from '../src/promises';
import type * as Letters from '../src/sayit/letters';
import type * as Session from '../src/session';
import type * as Run from '../src/session/run';
import type * as Service from '../src/session/service';
import type * as Voice from '../src/voice';
import type * as Chooser from '../src/chooser';
import type * as Day from '../src/day';
import type * as Fsrs from '../src/fsrs';
import type * as Garden from '../src/garden';
import type * as StageNames from '../src/garden/names';
import type * as DeclaredStageNames from '../exact/stage-names.d.ts';
import type * as AboutVersion from '../src/about/version';
import type * as DeclaredAboutVersion from '../exact/about-version.d.ts';
import type * as FirstFlow from '../src/first/flow';
import type * as DeclaredFirstFlow from '../exact/first-flow.d.ts';
import type * as FirstTour from '../src/first/tour';
import type * as DeclaredFirstTour from '../exact/first-tour.d.ts';
import type * as FirstGrowth from '../src/first/growth';
import type * as DeclaredFirstGrowth from '../exact/first-growth.d.ts';
import type * as FirstWords from '../src/first/words';
import type * as DeclaredFirstWords from '../exact/first-words.d.ts';
import type * as FirstVerse from '../src/first/verse';
import type * as DeclaredFirstVerse from '../exact/first-verse.d.ts';
import type * as TipWords from '../src/field/tip-words';
import type * as DeclaredTips from '../exact/tips.d.ts';
import type * as Reading from '../src/voice/reading';
import type * as DeclaredReading from '../exact/reading.d.ts';
import type * as Kjv from '../src/kjv';
import type * as Lists from '../src/lists';
import type * as Passages from '../src/passages';
import type * as SayIt from '../src/sayit';

/** Whether `A` and `B` are each assignable to the other. */
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const DECLARED: readonly true[] = [
  true satisfies Mutual<typeof Chooser.LIMIT_LINE, typeof DeclaredChooser.LIMIT_LINE>,
  true satisfies Mutual<
    typeof Chooser.SINGLES_LIMIT_LINE,
    typeof DeclaredChooser.SINGLES_LIMIT_LINE
  >,
  true satisfies Mutual<typeof Chooser.SHORT_LINE, typeof DeclaredChooser.SHORT_LINE>,
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
  true satisfies Mutual<typeof StageNames.STAGE_NAMES, typeof DeclaredStageNames.STAGE_NAMES>,
  true satisfies Mutual<
    typeof AboutVersion.VERSION_PREFIX,
    typeof DeclaredAboutVersion.VERSION_PREFIX
  >,
  true satisfies Mutual<typeof FirstFlow.openingOf, typeof DeclaredFirstFlow.openingOf>,
  true satisfies Mutual<FirstFlow.Opening, DeclaredFirstFlow.Opening>,
  true satisfies Mutual<typeof FirstFlow.shownOpening, typeof DeclaredFirstFlow.shownOpening>,
  true satisfies Mutual<FirstFlow.Phase, DeclaredFirstFlow.Phase>,
  true satisfies Mutual<FirstFlow.Flow, DeclaredFirstFlow.Flow>,
  true satisfies Mutual<FirstFlow.Input, DeclaredFirstFlow.Input>,
  true satisfies Mutual<typeof FirstFlow.begin, typeof DeclaredFirstFlow.begin>,
  true satisfies Mutual<typeof FirstFlow.isOwn, typeof DeclaredFirstFlow.isOwn>,
  true satisfies Mutual<typeof FirstFlow.step, typeof DeclaredFirstFlow.step>,
  true satisfies Mutual<typeof FirstFlow.observe, typeof DeclaredFirstFlow.observe>,
  true satisfies Mutual<Reading.Ending, DeclaredReading.Ending>,
  true satisfies Mutual<FirstTour.Tour, DeclaredFirstTour.Tour>,
  true satisfies Mutual<FirstTour.TourTap, DeclaredFirstTour.TourTap>,
  true satisfies Mutual<typeof FirstTour.tourStep, typeof DeclaredFirstTour.tourStep>,
  true satisfies Mutual<typeof FirstGrowth.GROWTH, typeof DeclaredFirstGrowth.GROWTH>,
  true satisfies Mutual<FirstGrowth.GrowthFrame, DeclaredFirstGrowth.GrowthFrame>,
  true satisfies Mutual<typeof FirstGrowth.GROWTH_STILL, typeof DeclaredFirstGrowth.GROWTH_STILL>,
  true satisfies Mutual<typeof FirstGrowth.GROWTH_STEPS, typeof DeclaredFirstGrowth.GROWTH_STEPS>,
  true satisfies Mutual<typeof FirstGrowth.GROWTH_START, typeof DeclaredFirstGrowth.GROWTH_START>,
  true satisfies Mutual<typeof FirstGrowth.growthAt, typeof DeclaredFirstGrowth.growthAt>,
  true satisfies Mutual<FirstWords.IntroRun, DeclaredFirstWords.IntroRun>,
  true satisfies Mutual<typeof FirstWords.WELCOME, typeof DeclaredFirstWords.WELCOME>,
  true satisfies Mutual<typeof FirstWords.GROWS, typeof DeclaredFirstWords.GROWS>,
  true satisfies Mutual<typeof FirstWords.ONWARD, typeof DeclaredFirstWords.ONWARD>,
  true satisfies Mutual<FirstWords.ShownPhase, DeclaredFirstWords.ShownPhase>,
  true satisfies Mutual<typeof FirstWords.COPY, typeof DeclaredFirstWords.COPY>,
  true satisfies Mutual<typeof FirstWords.PHASES, typeof DeclaredFirstWords.PHASES>,
  true satisfies Mutual<typeof FirstWords.REPLAY, typeof DeclaredFirstWords.REPLAY>,
  true satisfies Mutual<typeof FirstWords.PILLS, typeof DeclaredFirstWords.PILLS>,
  true satisfies Mutual<typeof FirstVerse.FIRST_VERSE, typeof DeclaredFirstVerse.FIRST_VERSE>,
  true satisfies Mutual<typeof FirstVerse.ownPassagesOf, typeof DeclaredFirstVerse.ownPassagesOf>,
  true satisfies Mutual<typeof TipWords.TIPS, typeof DeclaredTips.TIPS>,
  true satisfies Mutual<typeof Passages.PASSAGES_KEY, typeof DeclaredPassages.PASSAGES_KEY>,
  true satisfies Mutual<typeof Passages.LISTS_KEY, typeof DeclaredPassages.LISTS_KEY>,
  true satisfies Mutual<typeof Passages.MOST_PASSAGES, typeof DeclaredPassages.MOST_PASSAGES>,
  true satisfies Mutual<typeof Passages.MOST_VERSES, typeof DeclaredPassages.MOST_VERSES>,
  true satisfies Mutual<typeof Passages.SINGLES_KEY, typeof DeclaredPassages.SINGLES_KEY>,
  true satisfies Mutual<typeof Passages.MOST_SINGLES, typeof DeclaredPassages.MOST_SINGLES>,
  true satisfies Mutual<typeof Passages.LEAST_VERSES, typeof DeclaredPassages.LEAST_VERSES>,
  true satisfies Mutual<typeof Passages.verseCount, typeof DeclaredPassages.verseCount>,
  true satisfies Mutual<Passages.JoinAnswer, DeclaredPassages.JoinAnswer>,
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
  true satisfies Mutual<typeof Kjv.versesOf, typeof DeclaredKjv.versesOf>,
  true satisfies Mutual<typeof Garden.cueIn, typeof DeclaredGarden.cueIn>,
  true satisfies Mutual<Session.Piece, DeclaredSession.Piece>,
  true satisfies Mutual<Session.TextPiece, DeclaredSession.TextPiece>,
  true satisfies Mutual<Session.Item, DeclaredSession.Item>,
  true satisfies Mutual<Session.Plan, DeclaredSession.Plan>,
  true satisfies Mutual<typeof Session.isDone, typeof DeclaredSession.isDone>,
  true satisfies Mutual<typeof Session.countsOf, typeof DeclaredSession.countsOf>,
  true satisfies Mutual<typeof Service.MINUTES_KEY, typeof DeclaredService.MINUTES_KEY>,
  true satisfies Mutual<Service.SessionView, DeclaredService.SessionView>,
  true satisfies Mutual<Service.VisitVerse, DeclaredService.VisitVerse>,
  true satisfies Mutual<Promises.Collection, DeclaredService.Collection>,
  true satisfies Mutual<typeof Service.Session, typeof DeclaredService.Session>,
  true satisfies Mutual<typeof Service.layer, typeof DeclaredService.layer>,
  true satisfies Mutual<Run.Shown, DeclaredRun.Shown>,
  true satisfies Mutual<typeof Run.shownOf, typeof DeclaredRun.shownOf>,
  true satisfies Mutual<Grown.Grown, DeclaredGrown.Grown>,
  true satisfies Mutual<typeof Grown.grownOf, typeof DeclaredGrown.grownOf>,
  true satisfies Mutual<typeof Grown.tendedOf, typeof DeclaredGrown.tendedOf>,
  true satisfies Mutual<Dictation.DictationView, DeclaredDictation.DictationView>,
  true satisfies Mutual<Dictation.EngineReport, DeclaredDictation.EngineReport>,
  true satisfies Mutual<Dictation.Status, DeclaredDictation.Status>,
  true satisfies Mutual<Dictation.Engine, DeclaredDictation.Engine>,
  true satisfies Mutual<Dictation.Ending, DeclaredDictation.Ending>,
  true satisfies Mutual<typeof Dictation.Dictation, typeof DeclaredDictation.Dictation>,
  true satisfies Mutual<Voice.VoiceInfo, DeclaredVoice.VoiceInfo>,
  true satisfies Mutual<typeof Voice.bestVoice, typeof DeclaredVoice.bestVoice>,
  true satisfies Mutual<typeof Letters.lettersOf, typeof DeclaredLetters.lettersOf>,
  true satisfies Mutual<typeof Letters.PEEK_SHOWN_MS, typeof DeclaredLetters.PEEK_SHOWN_MS>,
  true satisfies Mutual<typeof Lists.singleVersesOf, typeof DeclaredLists.singleVersesOf>,
  true satisfies Mutual<typeof SayItMotion.SAYIT_MOTION, typeof DeclaredSayItMotion.SAYIT_MOTION>,
  true satisfies Mutual<typeof HomeMotion.MOTION, typeof DeclaredHomeMotion.MOTION>,
  true satisfies Mutual<HomeMotion.PlantMotion, DeclaredHomeMotion.PlantMotion>,
  true satisfies Mutual<typeof HomeMotion.endMotionOf, typeof DeclaredHomeMotion.endMotionOf>,
  true satisfies Mutual<Field.PlantStage, DeclaredField.PlantStage>,
  true satisfies Mutual<Field.FieldPassage, DeclaredField.FieldPassage>,
  true satisfies Mutual<Field.Field, DeclaredField.Field>,
  true satisfies Mutual<typeof Field.fieldOf, typeof DeclaredField.fieldOf>,
  true satisfies Mutual<typeof Field.sownText, typeof DeclaredField.sownText>,
  true satisfies Mutual<typeof Field.harvestText, typeof DeclaredField.harvestText>,
  true satisfies Mutual<typeof Home.fieldPassagesWith, typeof DeclaredHome.fieldPassagesWith>,
  true satisfies Mutual<Shelves.Shelf, DeclaredShelves.Shelf>,
  true satisfies Mutual<typeof Shelves.SHELVES, typeof DeclaredShelves.SHELVES>,
  true satisfies Mutual<typeof Shelves.plantsSingly, typeof DeclaredShelves.plantsSingly>,
  true satisfies Mutual<typeof Shelves.offerStateOf, typeof DeclaredShelves.offerStateOf>,
  true satisfies Mutual<Chooser.Verses, DeclaredChooser.Verses>,
  true satisfies Mutual<typeof Chooser.tapVerse, typeof DeclaredChooser.tapVerse>,
  true satisfies Mutual<typeof Passages.isShort, typeof DeclaredPassages.isShort>,
  true satisfies Mutual<typeof Passages.heldCount, typeof DeclaredPassages.heldCount>,
  true satisfies Mutual<typeof Passages.SINGLES_TITLE, typeof DeclaredPassages.SINGLES_TITLE>,
  true satisfies Mutual<Home.HomeIcon, DeclaredHome.HomeIcon>,
  true satisfies Mutual<Home.FurrowKind, DeclaredHome.FurrowKind>,
  true satisfies Mutual<Home.FurrowPlant, DeclaredHome.FurrowPlant>,
  true satisfies Mutual<Home.Furrow, DeclaredHome.Furrow>,
  true satisfies Mutual<Home.SinglePlant, DeclaredHome.SinglePlant>,
  true satisfies Mutual<Home.Greeting, DeclaredHome.Greeting>,
  true satisfies Mutual<typeof Home.captionOf, typeof DeclaredHome.captionOf>,
  true satisfies Mutual<typeof Home.furrowsOf, typeof DeclaredHome.furrowsOf>,
  true satisfies Mutual<typeof Home.singlesOf, typeof DeclaredHome.singlesOf>,
  true satisfies Mutual<typeof Home.verseOf, typeof DeclaredHome.verseOf>,
  true satisfies Mutual<typeof Home.readyOf, typeof DeclaredHome.readyOf>,
  true satisfies Mutual<typeof Home.minuteOf, typeof DeclaredHome.minuteOf>,
  true satisfies Mutual<typeof Home.greetingOf, typeof DeclaredHome.greetingOf>,
  true satisfies Mutual<HomeToday.TodayAction, DeclaredHomeToday.TodayAction>,
  true satisfies Mutual<HomeToday.TodayCard, DeclaredHomeToday.TodayCard>,
  true satisfies Mutual<typeof HomeToday.todayOf, typeof DeclaredHomeToday.todayOf>,
  true satisfies Mutual<typeof HomeStart.startOf, typeof DeclaredHomeStart.startOf>,
  true satisfies Mutual<List.ListStart, DeclaredList.ListStart>,
  true satisfies Mutual<typeof List.listStartOf, typeof DeclaredList.listStartOf>,
  true satisfies Mutual<typeof List.listLineOf, typeof DeclaredList.listLineOf>,
  true satisfies Mutual<typeof List.listCaptionOf, typeof DeclaredList.listCaptionOf>,
];

it('declares for Exact what each module the port imports exports', () => {
  expect(DECLARED.every((each) => each)).toBe(true);
});
