/** The landing's room, as the chapter's `scroll-padding-top`. */
export interface ChapterLand {
  room: number;
}

/** The frames the landing reads, each in the viewport's points. */
export interface LandFrames {
  /** `chapter-seen`: the screen between iOS's navigation bar and tab bar (the whole page on the web). */
  readonly seenTop: number;
  readonly seenHeight: number;
  /** `chapter-scroll`, whose foot may lie above the seen area's (the packs' line under it). */
  readonly scrollTop: number;
  readonly scrollHeight: number;
  readonly verseHeight: number;
  /** The verse's top after the last landing, and the room that landing used; a room under 0 when none has been read. */
  readonly landedTop: number;
  readonly landedRoom: number;
}

const MARGIN = 16;

/** A frame's measure, or 0 where the host gave none it could lay out. */
const measured = (value: number) => {
  if (Number.isFinite(value)) return value;
  return 0;
};

/** What the reader sees of the chapter, top and height: the seen area down to the scroll's foot; before the seen box has a height (a hidden tab), the scroll. */
const seenOf = (frames: LandFrames) => {
  const scrollTop = measured(frames.scrollTop);
  const scrollFoot = scrollTop + Math.max(0, measured(frames.scrollHeight));
  const height = measured(frames.seenHeight);
  if (height > 0) {
    const top = measured(frames.seenTop);
    return { top, height: Math.max(0, Math.min(top + height, scrollFoot) - top) };
  }
  return { top: scrollTop, height: scrollFoot - scrollTop };
};

/**
 * Where the scroll's padding counts from, in whole points: the scroll's top
 * until a landing has been read, then where that landing shows it (the
 * verse's top less the room it used). On iOS the scroll runs under the
 * navigation bar and the host counts from its top or from under the bar by
 * how the landing reached it, so a landing's own reading settles it. The
 * origin lies between the scroll's top and the seen area's: a reading
 * outside them is a landing the scroll's end stopped short (an early verse,
 * or a chapter that fits), which moves no origin, so it is held there and
 * the room stops growing with each reading.
 */
export const portOf = (frames: LandFrames) => {
  const scrollTop = measured(frames.scrollTop);
  if (!Number.isFinite(frames.landedRoom) || frames.landedRoom < 0) return scrollTop;
  const seenTop = seenOf(frames).top;
  const shown = Math.round(measured(frames.landedTop) - frames.landedRoom);
  return Math.min(Math.max(shown, Math.min(scrollTop, seenTop)), Math.max(scrollTop, seenTop));
};

/**
 * Where a verse opened on lands, as the room above it from where the
 * scroll's padding counts (`portOf`): a third of the way down what the
 * reader sees of the chapter, or higher where the verse is taller than the
 * two thirds below that line, so all of it shows with a 16 pt margin under
 * it. The room adds whatever of the bar lies below that origin; on the web
 * the tops are one.
 */
export const landRoom = (frames: LandFrames): number => {
  const seen = seenOf(frames);
  const cover = Math.max(0, seen.top - portOf(frames));
  return (
    cover +
    Math.min(seen.height / 3, Math.max(0, seen.height - measured(frames.verseHeight) - MARGIN))
  );
};

/** The landing's source, as `app.ts` registers it with the chapter's. */
export const landSources = {
  chapterLand: ([
    seenTop,
    seenHeight,
    scrollTop,
    scrollHeight,
    verseHeight,
    landedTop,
    landedRoom,
  ]: readonly [number, number, number, number, number, number, number]): ChapterLand => ({
    room: landRoom({
      seenTop,
      seenHeight,
      scrollTop,
      scrollHeight,
      verseHeight,
      landedTop,
      landedRoom,
    }),
  }),
};
