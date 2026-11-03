import { Array as Arr, Boolean as Bool, Option, Result } from 'effect';
import type { Act } from '../core/schema.ts';
import { type BoardName, type BoardStyle, PANEL_START, boardNamed } from '../core/board.ts';
import { type CastLock, castLockNote } from '../core/cast-lock.ts';
import { parse } from '../core/narration.ts';

const STYLE_REF =
  'The first reference image shows the art style only: take its line, shapes, colour handling, faces, paper texture and light, but none of its people, its room or its layout. Its hands float free beside the body, which this film no longer draws: every hand here is at the end of an arm in its sleeve.';

const SHOT_REF =
  'The second reference image is an earlier shot of this same beat in this same style: keep its place, its people, their colours and the paper as they are, and change only what this moment describes.';

const TEXT_RULE =
  'TEXT: no captions, no subtitles, no narration, no titles, no speech bubbles, no signatures and no labels anywhere. Where the brief names a word card, a title, a question or a verse being written or shown, leave it out: the film sets every spoken word as a full-screen card of its own. The only letters allowed are one short word the brief puts on a prop in this moment (a stamp, a sign), spelled exactly; otherwise no letters or numbers at all, and any paper, book or tablet in the frame is blank or shows only soft unreadable lines.';

const RULES =
  'RULES: Shade with colour: every shaded side and every cast shadow turns its hue toward the complement of the light (violet-blue under a warm light), never black and never plain grey; outlines may be dark. Hands are plain round circles at the end of an arm in its sleeve: no thumbs, no fingers, and never a hand floating free beside the body. No crosses on buildings, church buildings, religious symbols, logos or emblems anywhere, unless the brief names one. One clean, calm, finished 16:9 animated-film frame: not a photograph, not a comic page, not a character sheet, no panels or borders.';

export interface BoardBeat {
  readonly id: BoardName;
  readonly say: Option.Option<string>;
  readonly picture: Option.Option<string>;
  readonly cast: ReadonlyArray<string>;
}

const markWords = (beat: BoardBeat, most = 6): ReadonlyMap<string, string> =>
  Option.match(beat.say, {
    onNone: () => new Map<string, string>(),
    onSome: (say) =>
      Result.match(parse(beat.id, say), {
        onFailure: () => new Map<string, string>(),
        onSuccess: (parsed) => {
          const words = parsed.spoken.split(/\s+/).filter((w) => w.length > 0);
          const starts = [...parsed.marks.values()].toSorted((a, b) => a - b);
          return new Map(
            [...parsed.marks].map(([name, i]) => {
              const next = starts.find((s) => s > i) ?? words.length;
              const said = words.slice(i, Math.min(next, i + most));
              const more = Bool.match(Math.min(next, words.length) > i + most, {
                onTrue: () => '…',
                onFalse: () => '',
              });
              return [name, `${said.join(' ')}${more}`];
            }),
          );
        },
      }),
  });

const briefOf = (picture: string, words: ReadonlyMap<string, string>): string =>
  picture.replace(/`([A-Za-z0-9_-]+)`/g, (_, name: string) =>
    Option.match(Option.fromUndefinedOr(words.get(name)), {
      onNone: () => name,
      onSome: (said) => `«${said.replace(/[“”"]/g, '')}»`,
    }),
  );

const lightOf = (act: Act): string => {
  const mid = (r: readonly [number, number]) => (r[0] + r[1]) / 2;
  const key = Option.map(Option.fromUndefinedOr(act.luma), (r) => keyOf(mid(r)));
  const colour = Option.map(Option.fromUndefinedOr(act.saturation), (r) => colourOf(mid(r)));
  return Arr.getSomes([key, colour]).join(', with ');
};

const keyOf = (luma: number): string => {
  if (luma >= 150) return 'a bright, high-key frame';
  if (luma >= 120) return 'a mid-key frame, neither bright nor dark';
  return 'a low-key frame, mostly dark, with one lit place';
};

const colourOf = (sat: number): string => {
  if (sat < 0.2) return 'muted, quiet colour';
  if (sat < 0.3) return 'gently saturated colour';
  return 'rich, warm colour';
};

interface PanelPrompt {
  readonly style: BoardStyle;
  readonly act: Option.Option<Act>;
  readonly beat: BoardBeat;
  readonly at: string;
  readonly shot: boolean;
  readonly tweak: Option.Option<{ readonly text: string; readonly sketch: boolean }>;
  readonly cast: ReadonlyArray<CastLock>;
}

const castNotes = (cast: ReadonlyArray<CastLock>, before: number): ReadonlyArray<string> =>
  cast.reduce<{ readonly next: number; readonly notes: ReadonlyArray<string> }>(
    ({ next, notes }, lock) => ({
      next: next + lock.files.length,
      notes: [...notes, castLockNote(lock, next)],
    }),
    { next: before + 1, notes: [] },
  ).notes;

const pictureOf = (beat: BoardBeat, at: string) => {
  const words = markWords(beat);
  return {
    brief: Option.map(beat.picture, (picture) => briefOf(picture, words)),
    said: Option.map(
      Option.liftPredicate(at, (a) => a !== PANEL_START),
      (a) => (words.get(a) ?? a).replace(/[“”"]/g, ''),
    ),
  };
};

export const pictureWords = (beat: BoardBeat, at: string): ReadonlyArray<string> => {
  const { brief, said } = pictureOf(beat, at);
  return Arr.getSomes([brief, said]);
};

export const boardBeatOf = (beat: {
  readonly id: string;
  readonly say?: string;
  readonly picture?: string;
  readonly cast?: ReadonlyArray<string>;
}): Option.Option<BoardBeat> =>
  Option.map(boardNamed(beat.id), (id) => ({
    id,
    say: Option.fromUndefinedOr(beat.say),
    picture: Option.fromUndefinedOr(beat.picture),
    cast: beat.cast ?? [],
  }));

export const panelPrompt = (p: PanelPrompt): string => {
  const { brief, said } = pictureOf(p.beat, p.at);
  const refs = Option.match(p.tweak, {
    onNone: () => [
      STYLE_REF,
      ...Bool.match(p.shot, { onTrue: () => [SHOT_REF], onFalse: () => [] }),
    ],
    onSome: (t) => [
      STYLE_REF,
      'The second reference image is this frame as it stands: keep its paper, cast, setting and light, and make the change THE TWEAK asks plainly, so the new frame differs from it at a glance.',
      ...Bool.match(t.sketch, {
        onTrue: () => [
          'The third reference image is that same frame with the change drawn over it by hand (black ink for a drawing, red for a correction, gold for what works): follow what the marks mean, but draw none of the marks, arrows or handwriting into the new frame.',
        ],
        onFalse: () => [],
      }),
    ],
  });
  const moment = Option.match(said, {
    onNone: () =>
      'THE MOMENT: this frame opens the beat, before its first turn: what the brief has on screen as the beat begins.',
    onSome: (w) =>
      `THE MOMENT: this frame holds from the narrator's words «${w}»: draw what the brief has on screen at that moment, and nothing the brief brings in later.`,
  });
  return [
    p.style.block,
    [...refs, ...castNotes(p.cast, refs.length)].join(' '),
    ...Option.toArray(
      Option.map(Option.fromUndefinedOr(p.style.world), (w) => `THE FILM'S WORLD: ${w}`),
    ),
    ...Option.toArray(
      Option.map(p.act, (act) => {
        const light = lightOf(act);
        const lit = Bool.match(light === '', { onTrue: () => '', onFalse: () => `: ${light}` });
        return `THE ACT: "${act.name}"${lit}.`;
      }),
    ),
    ...Option.toArray(
      Option.map(
        brief,
        (b) =>
          `THE BEAT'S BRIEF (the words in «» are what the narrator says as each change lands): ${b}`,
      ),
    ),
    moment,
    ...Option.toArray(
      Option.map(
        p.tweak,
        (t) =>
          `THE TWEAK (the reason this frame is drawn again; a change too small to notice fails it): ${t.text}`,
      ),
    ),
    TEXT_RULE,
    RULES,
  ].join('\n\n');
};

export const actOf = (
  acts: ReadonlyArray<Act>,
  beats: ReadonlyArray<string>,
  beat: string,
): Option.Option<Act> => {
  const at = beats.indexOf(beat);
  if (at < 0) return Option.none();
  const before = acts.filter((a) => {
    const from = beats.indexOf(a.from);
    return from >= 0 && from <= at;
  });
  return Option.fromUndefinedOr(before.at(-1) ?? acts[0]);
};
