/** The landing's room, as the chapter's `scroll-padding-top`. */
export interface ChapterLand {
  room: number;
}

/** The frames the landing reads, each in the viewport's points. */
export interface LandFrames {
  readonly seenTop: number;
  readonly seenHeight: number;
  readonly scrollTop: number;
  readonly scrollHeight: number;
  readonly verseHeight: number;
}

const MARGIN = 16;

/** A frame's measure, or 0 where the host gave none it could lay out. */
const measured = (value: number) => {
  if (Number.isFinite(value)) return value;
  return 0;
};

/** The seen area's height and the bars' cover over the scroll's top; before the seen box has a height (a hidden tab), the scroll's height with no cover. */
const seenOf = (frames: LandFrames) => {
  const height = measured(frames.seenHeight);
  if (height > 0)
    return {
      height,
      cover: Math.max(0, measured(frames.seenTop) - measured(frames.scrollTop)),
    };
  return { height: Math.max(0, measured(frames.scrollHeight)), cover: 0 };
};

/**
 * Where a verse opened on lands, as the room above it from the chapter
 * scroll's top: a third of the way down what the reader sees of the chapter
 * (`chapter-seen`, the screen between iOS's navigation bar and tab bar), or
 * higher where the verse is taller than the two thirds below that line, so
 * all of it shows with a 16 pt margin under it. The host measures the
 * scroll's padding from the scroll's own top, and on iOS the scroll runs
 * under the navigation bar, so the room adds the bar's cover
 * (`seenTop - scrollTop`); on the web the two tops are one.
 */
export const landRoom = (frames: LandFrames): number => {
  const seen = seenOf(frames);
  return (
    seen.cover +
    Math.min(seen.height / 3, Math.max(0, seen.height - measured(frames.verseHeight) - MARGIN))
  );
};

/** The landing's source, as `app.ts` registers it with the chapter's. */
export const landSources = {
  chapterLand: ([seenTop, seenHeight, scrollTop, scrollHeight, verseHeight]: readonly [
    number,
    number,
    number,
    number,
    number,
  ]): ChapterLand => ({
    room: landRoom({ seenTop, seenHeight, scrollTop, scrollHeight, verseHeight }),
  }),
};
