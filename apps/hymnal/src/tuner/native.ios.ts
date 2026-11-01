/**
 * The tuner's ear on iOS: the Swift package `native/tuner`, which One's
 * prebuild makes a local pod and its bundler binds here. Only this file
 * imports the Swift source: One's bundler refuses a `.swift` import in an
 * Android or web build.
 */

import { Array as Arr, Effect, Option } from 'effect';

import { Listen as Native } from '../../native/tuner/Listen.swift';
import type { Listen, ListenEnd } from './native';

const ENDS: ReadonlyArray<ListenEnd> = ['stopped', 'interruption', 'route', 'failure'];

/** A frame's bytes (Float32, little-endian like the device) as samples, viewed in place when they sit on a 4-byte boundary, else copied. */
const samples = (bytes: Uint8Array): Float32Array => {
  if (bytes.byteOffset % 4 === 0) {
    return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength >> 2);
  }
  return new Float32Array(bytes.slice().buffer, 0, bytes.byteLength >> 2);
};

/** The end the module sent, or `failure` for a reason this side does not know. */
const reason = (value: string): ListenEnd =>
  Arr.findFirst(ENDS, (end) => end === value).pipe(Option.getOrElse((): ListenEnd => 'failure'));

export const listen: Option.Option<Listen> = Option.some({
  start: Effect.tryPromise(() => Native.start()),
  stop: Effect.promise(() => Native.stop()),
  onFrame: (listener) => Native.onFrame((bytes) => listener(samples(bytes))),
  onEnd: (listener) => Native.onEnd((value) => listener(reason(value))),
});

/** Whether this platform has the ear; the tuner's entries show only where it does. */
export const available: boolean = Option.isSome(listen);
