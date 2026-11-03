import { Array as Arr, Effect, Option, Stream } from 'effect';
import {
  ALL_FORMATS,
  BufferTarget,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  FilePathSource,
  Input,
  Mp4OutputFormat,
  Output,
} from 'mediabunny';

const SEGMENT_FPS = 30;

const SEGMENT = new URL('../../tools/fixtures/segment-a.mp4', import.meta.url).pathname;

const present = <A>(what: string, value: A) =>
  Option.match(Option.fromNullishOr(value), {
    onNone: () => Effect.die(`the segment has no ${what}`),
    onSome: Effect.succeed,
  });

export interface RatedTiming {
  readonly timescale?: number;
  readonly grid?: number;
  readonly last?: number;
  readonly drop?: ReadonlyArray<number>;
  readonly nudge?: ReadonlyArray<readonly [frame: number, by: number]>;
}

export const ratedVideo = (
  fps: number,
  frames: number,
  { timescale = fps, grid, last, drop = [], nudge = [] }: RatedTiming = {},
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const input = yield* Effect.acquireRelease(
        Effect.sync(() => new Input({ source: new FilePathSource(SEGMENT), formats: ALL_FORMATS })),
        (opened) => Effect.sync(() => opened.dispose()),
      );
      const track = yield* present(
        'video track',
        yield* Effect.promise(() => input.getPrimaryVideoTrack()),
      );
      const decoderConfig = yield* present(
        'decoder config',
        yield* Effect.promise(() => track.getDecoderConfig()),
      );
      const packets = yield* Stream.runCollect(
        Stream.fromAsyncIterable(new EncodedPacketSink(track).packets(), String),
      ).pipe(Effect.orDie);
      const target = new BufferTarget();
      const output = new Output({
        format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
        target,
      });
      const source = new EncodedVideoPacketSource('avc');
      output.addVideoTrack(source, { frameRate: timescale });
      yield* Effect.promise(() => output.start());
      const moved = new Map(nudge);
      const at = (frame: number) =>
        Option.match(Option.fromUndefinedOr(grid), {
          onNone: () => frame / fps,
          onSome: (step) => Math.floor(frame / fps / step + 1e-9) * step,
        }) + Option.getOrElse(Option.fromUndefinedOr(moved.get(frame)), () => 0);
      const laid = Arr.flatMap(Arr.range(0, Math.ceil(frames / packets.length) - 1), (pass) =>
        packets.map((packet) => {
          const frame = pass * packets.length + Math.round(packet.timestamp * SEGMENT_FPS);
          const duration = Option.getOrElse(
            Option.filter(Option.fromUndefinedOr(last), () => frame === frames - 1),
            () => at(frame + 1) - at(frame),
          );
          return { frame, packet: packet.clone({ timestamp: at(frame), duration }) };
        }),
      )
        .slice(0, frames)
        .filter(({ frame }) => !drop.includes(frame))
        .map(({ packet }) => packet);
      for (const [i, packet] of laid.entries())
        yield* Effect.promise(() =>
          source.add(
            packet,
            Option.getOrUndefined(
              Option.some({ decoderConfig }).pipe(Option.filter(() => i === 0)),
            ),
          ),
        );
      yield* Effect.promise(() => output.finalize());
      return new Uint8Array(yield* present('written bytes', target.buffer));
    }),
  );
