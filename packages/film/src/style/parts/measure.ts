import { Schema } from 'effect';

export const Units = Schema.Finite;

export const Length = Schema.Finite.check(Schema.isGreaterThan(0));

export const Point = Schema.Tuple([Schema.Finite, Schema.Finite]);

// oxlint-disable-next-line film/one-clock-epsilon -- a share of an outline's span, no time
const FLAT = 1e-9;

const notOnOneLine = Schema.makeFilter((pts: ReadonlyArray<readonly [number, number]>) => {
  const [first, ...rest] = pts;
  if (first === undefined || rest.length < 2) return true;
  const span = (p: readonly [number, number]) => Math.hypot(p[0] - first[0], p[1] - first[1]);
  const far = rest.reduce((a, p) => (span(p) > span(a) ? p : a), first);
  const reach = span(far);
  if (reach === 0)
    return `its points all lie at (${first[0]}, ${first[1]}), so it encloses no area`;
  const [dx, dy] = [far[0] - first[0], far[1] - first[1]];
  const off = (p: readonly [number, number]) =>
    Math.abs(dx * (p[1] - first[1]) - dy * (p[0] - first[0])) / reach;
  return rest.some((p) => off(p) > FLAT * reach)
    ? true
    : 'its points all lie on one line, so it encloses no area';
});

export const Outline = Schema.Array(Point).check(Schema.isMinLength(3), notOnOneLine);

export const Corners = Outline.check(
  Schema.makeFilter((corners: ReadonlyArray<readonly [number, number]>) => {
    const at = corners.findIndex((c, i) => {
      const next = corners[(i + 1) % corners.length] ?? c;
      return c[0] === next[0] && c[1] === next[1];
    });
    return at < 0
      ? true
      : `corners ${at} and ${(at + 1) % corners.length} lie at one point: a corner is rounded along its edges`;
  }),
);

export const Share = Schema.Finite.check(
  Schema.isBetween({ minimum: 0, maximum: 1, exclusiveMinimum: true, exclusiveMaximum: true }),
);

export const Opacity = Schema.Finite.check(
  Schema.isBetween({ minimum: 0, maximum: 1, exclusiveMinimum: true }),
);

export const oneRadiusOrEach = Schema.makeFilter(
  (cut: { readonly corners: ReadonlyArray<unknown>; readonly radii: ReadonlyArray<unknown> }) =>
    cut.radii.length === 1 || cut.radii.length === cut.corners.length
      ? true
      : `${cut.radii.length} radii for ${cut.corners.length} corners: give one, or one for each`,
);
