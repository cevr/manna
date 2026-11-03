import { Match, Option } from 'effect';

import { color, useAccent } from '~/color';

import { type ScrubberProps, useScrub } from './scrub';

const stepOf = (key: string, from: number, max: number): Option.Option<number> => {
  const page = Math.max(1, max / 10);
  return Match.value(key).pipe(
    Match.when('ArrowRight', () => Option.some(from + 1)),
    Match.when('ArrowUp', () => Option.some(from + 1)),
    Match.when('ArrowLeft', () => Option.some(from - 1)),
    Match.when('ArrowDown', () => Option.some(from - 1)),
    Match.when('PageUp', () => Option.some(from + page)),
    Match.when('PageDown', () => Option.some(from - page)),
    Match.when('Home', () => Option.some(0)),
    Match.when('End', () => Option.some(max)),
    Match.orElse(() => Option.none<number>()),
    Option.map((to) => Math.min(Math.round(Math.min(Math.max(to, 0), max)), Math.floor(max))),
  );
};

const css = `
input.position { appearance: none; -webkit-appearance: none; height: 20px; background-color: transparent; background-repeat: no-repeat; background-position: center; background-size: 100% 4px; cursor: pointer; }
input.position:disabled { cursor: default; }
input.position::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: var(--accent); border: none; }
input.position::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: var(--accent); border: none; }
input.position::-moz-range-track { background: transparent; }
input.position:disabled::-webkit-slider-thumb { background: var(--muted); }
input.position:disabled::-moz-range-thumb { background: var(--muted); }
`;

export function Scrubber(props: ScrubberProps) {
  const accent = useAccent();
  const scrub = useScrub(props);
  const share = Option.liftPredicate(scrub.max, (max) => max > 0).pipe(
    Option.map((max) => Math.min(scrub.value / max, 1)),
    Option.getOrElse(() => 0),
  );
  const played = `${share * 100}%`;
  return (
    <>
      <style href="hymnal-position" precedence="default">
        {css}
      </style>
      <input
        type="range"
        className="position"
        aria-label="Position"
        aria-valuetext={scrub.said}
        min={0}
        max={scrub.max}
        step={1}
        value={Math.floor(scrub.value)}
        disabled={scrub.still}
        onKeyDown={(event) => {
          const bar = event.currentTarget;
          for (const to of Option.toArray(
            stepOf(event.key, Number(bar.value), Number(bar.max) || 0),
          )) {
            event.preventDefault();
            scrub.step(to);
          }
        }}
        onPointerDown={(event) => {
          if (event.button === 0) scrub.press(event.pointerId);
        }}
        onChange={(event) => scrub.move(Number(event.currentTarget.value))}
        onPointerUp={(event) => scrub.lift(event.pointerId)}
        onPointerCancel={(event) => scrub.drop(event.pointerId)}
        onLostPointerCapture={(event) => scrub.drop(event.pointerId)}
        style={{
          width: '100%',
          margin: 0,
          backgroundImage: `linear-gradient(to right, ${String(accent)} ${played}, ${String(color.line)} ${played})`,
        }}
      />
    </>
  );
}
