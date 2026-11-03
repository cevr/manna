import { Array as Arr, Effect, Option } from 'effect';

import { Listen as Native } from '../../native/tuner/Listen.swift';
import type { Listen, ListenEnd } from './native';

const ENDS: ReadonlyArray<ListenEnd> = ['stopped', 'interruption', 'route', 'failure'];

const samples = (bytes: Uint8Array): Float32Array => {
  if (bytes.byteOffset % 4 === 0) {
    return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 2);
  }
  return new Float32Array(bytes.slice().buffer, 0, bytes.byteLength >> 2);
};

const reason = (value: string): ListenEnd =>
  Arr.findFirst(ENDS, (end) => end === value).pipe(Option.getOrElse((): ListenEnd => 'failure'));

export const listen: Option.Option<Listen> = Option.some({
  start: Effect.tryPromise(() => Native.start()),
  stop: Effect.promise(() => Native.stop()),
  onFrame: (listener) => Native.onFrame((bytes) => listener(samples(bytes))),
  onEnd: (listener) => Native.onEnd((value) => listener(reason(value))),
});

export const available: boolean = Option.isSome(listen);
