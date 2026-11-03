import * as BunServices from '@effect/platform-bun/BunServices';
import { Console, Effect, Layer } from 'effect';
import { Media } from '../media.ts';

const wave = Float32Array.from({ length: 44100 }, (_, i) => Math.sin(i / 7) * 0.5);
const pcm = { rate: 44100, frames: 44100, channels: [wave] };

Effect.runFork(
  Effect.gen(function* () {
    const media = yield* Media;
    const aac = yield* media.encodeAac(pcm);
    yield* Console.log(`aac packets=${aac.packets.length}`);
    const flac = yield* media.encodeFlac(pcm);
    yield* Console.log(`flac bytes=${flac.length}`);
  }).pipe(Effect.provide(Layer.provideMerge(Media.layer, BunServices.layer))),
);
