/**
 * The voice's native side on iOS: the Swift package `native/feel`, which
 * One's prebuild makes a local pod and its bundler binds here. Only this
 * file imports the Swift source: One's bundler refuses a `.swift` import in
 * an Android or web build.
 */

import { Option } from 'effect';

import { Voice } from '../../native/feel/Voice.swift';
import type { VoiceNative } from './sound';

export const voiceNative: Option.Option<VoiceNative> = Option.some(Voice);
