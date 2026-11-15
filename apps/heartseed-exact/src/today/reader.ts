/**
 * The system voice Hear it reads with, by the current Heartseed's rule:
 * Off reads nothing; Her and Him both read with the system voice
 * `bestVoice` picks among the device's (the best English voice that is
 * neither novelty nor personal, by quality, then en-US, then id), since
 * the current app tells them apart only in the natural voice. Exact's
 * voices (`speechSynthesisVoices`) are read as the current app's
 * `VoiceInfo`: Apple's quality default, enhanced and premium are 1, 2 and
 * 3, and a voice Apple says nothing of (the web's) is a default one.
 */

import { bestVoice, type VoiceInfo } from '@manna/heartseed/voice';
import { Option } from 'effect';

import { voiceOf } from '../settings/choices';

/** What Apple says of a voice, as much as the rule reads. */
interface AppleVoice {
  readonly quality: string;
  readonly isPersonalVoice: boolean;
  readonly isNoveltyVoice: boolean;
}

/** A voice as `@exact/speech-synthesis` reports it, as much as the rule reads. */
export interface ExactVoice {
  readonly voiceURI: string;
  readonly name: string;
  readonly lang: string;
  // oxlint-disable-next-line effect/noNullish -- Exact's option<AppleVoice> is null on the wire.
  readonly apple: AppleVoice | null;
}

/** Whether Hear it reads, and the voice it names (empty: the system's default). */
export interface TodayReader {
  on: boolean;
  voice: string;
}

const QUALITY = new Map([
  ['default', 1],
  ['enhanced', 2],
  ['premium', 3],
]);

/** An Exact voice as the current app's `VoiceInfo`. */
export const infoOf = (voice: ExactVoice): VoiceInfo => {
  const apple = Option.fromNullishOr(voice.apple);
  return {
    id: voice.voiceURI,
    language: voice.lang,
    name: voice.name,
    quality: Option.getOrElse(
      Option.flatMap(apple, (each) => Option.fromUndefinedOr(QUALITY.get(each.quality))),
      () => 1,
    ),
    novelty: Option.exists(apple, (each) => each.isNoveltyVoice),
    personal: Option.exists(apple, (each) => each.isPersonalVoice),
  };
};

/** What Hear it does under the Voice kept as `kept`, over the device's `voices`. */
export const readerOf = (voices: readonly ExactVoice[], kept: string): TodayReader => {
  if (voiceOf(kept) === 'off') return { on: false, voice: '' };
  return {
    on: true,
    voice: Option.match(bestVoice(voices.map(infoOf)), {
      onNone: () => '',
      onSome: (best) => best.id,
    }),
  };
};

/** The reader's one source, as `app.ts` registers it, answered at once. */
export const readerSources = {
  todayReaderOf: ([voices, kept]: readonly [readonly ExactVoice[], string]): TodayReader =>
    readerOf(voices, kept),
};
