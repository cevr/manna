import { Array as Arr, Option, Order } from 'effect';
import { type Placed, transitionDur } from './layout.ts';
import { framesOf, secondsAt } from './time.ts';

/** A frame in a scene, and why it was picked (`mark name`, `cue name start`, `60%`). */
export interface SceneMoment {
  readonly scene: string;
  readonly frame: number;
  /** Film seconds. */
  readonly time: number;
  readonly at: string;
}

/** Which moments to take: marks as well as cue edges and the 60% point. */
interface MomentKinds {
  readonly marks: boolean;
}

/**
 * The moments of each scene, in frame order. A time is pulled inside the
 * scene's own frames, after its entering transition: mid-transition two
 * scenes slide or fade across each other by design. Moments on one frame
 * merge, their reasons joined.
 */
export const sceneMoments = (
  placed: ReadonlyArray<Placed>,
  fps: number,
  kinds: MomentKinds,
): ReadonlyArray<SceneMoment> =>
  placed.flatMap((p) => {
    const marks = [...p.voice.marks]
      .filter(() => kinds.marks)
      .map(([name, at]): readonly [string, number] => [`mark ${name}`, p.speechStart + at]);
    const moments: Array<readonly [string, number]> = [
      ...marks,
      ...[...p.cues].flatMap(([name, c]): Array<readonly [string, number]> => [
        [`cue ${name} start`, c.start],
        [`cue ${name} end`, c.end],
      ]),
      ['60%', p.dur * 0.6],
    ];
    const settled = Math.min(p.index, 1) * transitionDur(p.spec.enter);
    const { first, last } = framesOf({ from: p.start + settled, to: p.start + p.dur }, fps);
    const byFrame = new Map<number, Array<string>>();
    for (const [at, t] of moments) {
      const frame = Math.min(last, Math.max(first, Math.round((p.start + t) * fps)));
      const before = Option.getOrElse(Option.fromNullishOr(byFrame.get(frame)), () => []);
      byFrame.set(frame, [...before, at]);
    }
    return Arr.sort(
      [...byFrame].map(([frame, at]) => ({
        scene: p.spec.id,
        frame,
        time: secondsAt(frame, fps),
        at: at.join(', '),
      })),
      Order.mapInput(Order.Number, (s: SceneMoment) => s.frame),
    );
  });
