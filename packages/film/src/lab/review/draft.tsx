// A series draft in the Script reader (`/series/<series>/<draft>`, the
// review's): the draft's beats as its Markdown reads now (`core/draft.ts`,
// read by the server and sent with the page), drawn by the review's Script
// reader (`words/reader.tsx`) over the draft's routes: its staging takes, its
// delivery marks written into the draft's Markdown (`POST …/marks`, one cell
// changed and not another byte), the draft as the write leaves it shown and
// its takes read again, the beat's new take queued first.
//
// The words selected are kept in the URL on the draft's page
// (`/series/<series>/<draft>/<beat>?words=<a>-<b>`), and Clear adds no entry
// (`useUrlSelecting`); an ask that shows the draft keeps its own
// (`DraftReader`, whose `selecting` the page gives).

import { Place } from '@manna/url-state';
import { Option } from 'effect';
import { untrack } from 'solid-js';
import { addressOn } from '../../browser/host.ts';
import { wordsIn, wordsText } from '../../command/selection.ts';
import { Places, pageHref } from '../../core/api.ts';
import { PlaceStyle } from '../place-style.tsx';
import { useSheetDismissal } from '../sheet.tsx';
import { SCRIPT_READ_CSS } from '../script/style.ts';
import { DraftReader, useDraftTitles } from '../ask/draft.tsx';
import { useReview } from './context.tsx';
import { READER_CSS, type Selecting } from '../words/reader.tsx';

/**
 * A draft's page's own look, over the reader's (`READER_CSS`): one column at
 * a reading measure, its title and its series over the beats.
 */
const DRAFT_CSS = `
.dr { max-width: 720px; margin: 0 auto; background: var(--surface-1); }
.dr-head { padding: var(--s-3) var(--gutter) 0; }
.dr-head h1 { margin: 0; font-size: var(--fs-5); line-height: var(--lh-5); font-weight: var(--w-3); }
.dr-series { margin: 0; color: var(--text-2); font-size: var(--fs-2); line-height: var(--lh-2); }
.dr-status { margin: 0; padding: var(--s-3) var(--gutter); color: var(--text-2); }
`;

/** Words picked in a beat, as one name: what the dismissal is told was opened. */
const pickedName = (beat: string, words: string): string => `${beat}:${words}`;

/**
 * The words selected on a draft's page, as its URL holds them: in one beat,
 * the first not after the last. A pick made from nothing picked is a step
 * Back walks; Clear adds none, by the sheets' one rule (`useSheetDismissal`):
 * it goes Back over the pick's entry when Back lands on the draft as Clear
 * writes it, else it rewrites the entry on screen.
 */
const useUrlSelecting = (series: string, draft: string): Selecting => {
  const { state, meta } = useReview();
  const address = addressOn(meta.host);
  const dismissal = useSheetDismissal(meta.host, (href, picked) =>
    Option.exists(
      Place.decode(Places.draftBeat, href),
      (v) => pickedName(v.path.beat, v.query.words) === picked,
    ),
  );
  const selected = () => {
    const place = state.place();
    if (place._tag !== 'Draft') return Option.none();
    return Option.map(wordsIn(place.beat, place.words), (w) => ({
      beat: w.scene,
      from: w.from,
      to: w.to,
    }));
  };
  return {
    selected,
    select: (beat, w) => {
      const words = wordsText(w);
      if (Option.isNone(untrack(selected))) dismissal.opening(pickedName(beat, words));
      address.go(pageHref.draftBeat(series, draft, beat, words));
    },
    clear: () => dismissal.dismiss(() => Option.some(pageHref.draft(series, draft))),
  };
};

/** Series draft `draft` of `series`: its head, then its beats, or why it cannot be read. */
export const DraftPage = (props: { readonly series: string; readonly draft: string }) => {
  // Made once, in the page's body: a prop's getter would make it at each read, outside its owner.
  const selecting = useUrlSelecting(props.series, props.draft);
  const titles = useDraftTitles(props.series, props.draft);
  return (
    <>
      <PlaceStyle
        css={`
          ${SCRIPT_READ_CSS} ${READER_CSS} ${DRAFT_CSS}
        `}
      />
      <article class="dr" data-draft={`${props.series}/${props.draft}`}>
        <header class="dr-head">
          <p class="dr-series">{titles.series()}</p>
          <h1>{titles.draft()}</h1>
        </header>
        <DraftReader
          series={props.series}
          draft={props.draft}
          only={Option.none()}
          selecting={selecting}
          cost
        />
      </article>
    </>
  );
};
