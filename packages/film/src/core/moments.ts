import { Array as Arr, Option, Order } from 'effect';
import { type Placed, transitionDur } from './layout.ts';
import { framesOf, secondsAt } from './time.ts';

export interface SceneMoment {
  readonly scene: string;
  readonly frame: number;
  readonly time: number;
  readonly at: string;
}

interface MomentKinds {
  readonly marks: boolean;
}

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
