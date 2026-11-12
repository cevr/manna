/**
 * The welcome's growing seed as a pure plan, the durations of one cycle in
 * milliseconds: each stage's hold, each cross-fade, full corn's rest, and
 * the cycle they make. One cycle holds the seed, cross-fades to the blade,
 * holds it, cross-fades to the ear, holds it, cross-fades to full corn,
 * rests there longest, then cross-fades back to the seed. Every frame sums
 * to one and shows at most two neighbouring stages, so nothing cuts. The
 * drawing adapter (`./growing`) reads `GROWTH_STEPS`, the same points
 * `growthAt` interpolates, so the two cannot drift apart.
 */
export const GROWTH = (() => {
  const hold = 1100;
  const fade = 500;
  const rest = 1600;
  return { hold, fade, rest, cycle: 3 * hold + rest + 4 * fade };
})();

/** The four stages' opacities, in the order seed, blade, ear, full corn. */
export type GrowthFrame = readonly [seed: number, blade: number, ear: number, corn: number];

/** The frame that stands still: full corn alone. */
export const GROWTH_STILL: GrowthFrame = [0, 0, 0, 1];

/** The stage each held span of the cycle shows, in order: the seed, the blade and the ear for `hold`, full corn for `rest`. */
const HELD = [GROWTH.hold, GROWTH.hold, GROWTH.hold, GROWTH.rest];

/**
 * The cycle's points: at each instant of `at` (from 0 to `cycle`), each
 * stage's opacity in `opacity[stage]`; between two points it moves in a
 * straight line. It starts and ends on the seed alone.
 */
export const GROWTH_STEPS = (() => {
  const at: number[] = [0];
  const opacity: number[][] = [[1], [0], [0], [0]];
  let clock = 0;
  HELD.forEach((held, stage) => {
    for (const end of [clock + held, clock + held + GROWTH.fade]) at.push(end);
    clock += held + GROWTH.fade;
    opacity.forEach((row, each) => {
      row.push(Number(each === stage));
      row.push(Number(each === (stage + 1) % 4));
    });
  });
  return { at, opacity };
})();

/**
 * The clock the loop starts at and ends on: the end of full corn's rest,
 * where the frame is `GROWTH_STILL` and the cross-fade back to the seed
 * begins. Reanimated ends a loop under Reduce Motion one cycle on from
 * here, the same frame, so the still frame is full corn from the first.
 */
export const GROWTH_START = GROWTH.cycle - GROWTH.fade;

/** The straight line through the points of `row` at `ms` within one cycle. */
const along = (row: readonly number[], ms: number) => {
  const { at } = GROWTH_STEPS;
  const next = at.findIndex((each) => each > ms);
  if (next <= 0) return row[0] ?? 0;
  const from = at[next - 1] ?? 0;
  const to = at[next] ?? from;
  const low = row[next - 1] ?? 0;
  const high = row[next] ?? low;
  return low + ((ms - from) / (to - from)) * (high - low);
};

/** Each stage's opacity `ms` after the welcome showed: the seed alone at 0, and on a clock that is negative or not a number. */
export const growthAt = (ms: number): GrowthFrame => {
  if (!Number.isFinite(ms) || ms < 0) return [1, 0, 0, 0];
  const at = ms % GROWTH.cycle;
  const [seed = [], blade = [], ear = [], corn = []] = GROWTH_STEPS.opacity;
  return [along(seed, at), along(blade, at), along(ear, at), along(corn, at)];
};
