import { Option } from 'effect';

interface BoxAt {
  readonly scrollTop: number;
  readonly clientHeight: number;
}

interface Extent {
  readonly top: number;
  readonly bottom: number;
}

interface Clear {
  readonly top: number;
  readonly bottom: number;
}

export const placeTo = (box: BoxAt, span: Extent, clear: Clear): Option.Option<number> => {
  const inView =
    span.top >= box.scrollTop + clear.top &&
    span.bottom <= box.scrollTop + box.clientHeight - clear.bottom;
  if (inView) return Option.none();
  const third = span.top - box.clientHeight / 3;
  const toLast = span.bottom - box.clientHeight + clear.bottom;
  return Option.some(Math.max(0, Math.min(Math.max(third, toLast), span.top - clear.top)));
};

export const revealTo = (box: BoxAt, span: Extent, lastTop: () => number, clear: Clear): number => {
  const room = box.clientHeight - clear.top - clear.bottom;
  const kept = Option.getOrElse(
    Option.liftPredicate(span.top, () => span.bottom - span.top <= room),
    lastTop,
  );
  const to = Math.min(
    Math.max(box.scrollTop, span.bottom - box.clientHeight + clear.bottom),
    kept - clear.top,
  );
  return Math.max(0, to);
};
