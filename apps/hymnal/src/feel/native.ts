/**
 * The voice's native side on the web and Android: none. The web is not a
 * target for the voice, and Android's sounds are a follow-up (`feel-android`),
 * so a cue there is felt (One's haptics) and not heard.
 */

import { Option } from 'effect';

import type { VoiceNative } from './sound';

export const voiceNative: Option.Option<VoiceNative> = Option.none();
