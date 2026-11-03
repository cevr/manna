import { Option, Result } from 'effect';
import { NO_SOUNDS } from '../../core/sfx.ts';
import { hashText, parse, takeScript, voiceKey } from '../../core/narration.ts';
import { unmeasured } from '../../core/voiced.ts';
import {
  type VoiceTiming,
  SoundManifestJson,
  type Timed,
  type Timings,
  TimingsJson,
  type Voice,
} from '../../core/schema.ts';
import { type MeasuredFilm } from '../film-repo.ts';

export const testVoice: Voice = {
  voiceId: 'voice-1',
  model: 'eleven_v3',
  settings: { stability: 0.5 },
};

export const testFilm = (
  scenes: ReadonlyArray<Timed>,
  timings: Timings,
  voice: Voice = testVoice,
): MeasuredFilm => ({
  fps: 30,
  paths: {
    name: 'test',
    dir: '/films/test',
    narration: '/films/test/narration',
    sound: '/films/test/sound',
    out: '/out/test',
    timings: {
      file: '/films/test/narration/timings.json',
      codec: TimingsJson,
      empty: { voice: '', scenes: {} },
    },
    manifest: {
      file: '/films/test/sound/manifest.json',
      codec: SoundManifestJson,
      empty: {},
    },
  },
  scenes,
  voice: Option.some(voice),
  sound: Option.none(),
  shorts: [],
  timings,
  manifest: {},
  heardAs: {},
  look: Option.none(),
  looks: {},
  sounds: NO_SOUNDS,
  talk: Option.none(),
  credits: Option.none(),
});

export const spokenTake = (say: string): VoiceTiming => {
  const parsed = Result.getOrThrow(parse('take', say));
  const words = parsed.spoken
    .split(' ')
    .map((text, i) => ({ text, start: i * 0.5, end: i * 0.5 + 0.4 }));
  return {
    hash: hashText(takeScript(parsed)),
    file: 'take.mp3',
    duration: Math.max(0, ...words.map((w) => w.end)),
    words: unmeasured(words),
    source: 'elevenlabs',
  };
};

const TWELVE = 'one two three four five six seven eight nine ten eleven twelve';

export const holdScenes: ReadonlyArray<Timed> = [
  { id: 'held', say: TWELVE, timeline: { intro: { at: 'start', dur: 1.4 } } },
  { id: 'brief', say: TWELVE, timeline: { intro: { at: 'start', dur: 3.4 } } },
  { id: 'ambient', say: TWELVE, timeline: { intro: { at: 'start', dur: 1.4 } } },
];

export const holdTimings: Timings = {
  voice: voiceKey(testVoice),
  scenes: Object.fromEntries(holdScenes.map((s) => [s.id, spokenTake(TWELVE)])),
};

const TWENTY = `${TWELVE} thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty`;

export const longHoldScenes: ReadonlyArray<Timed> = [
  { id: 'long', say: TWENTY, timeline: { intro: { at: 'start', dur: 1.4 } } },
];

export const longHoldTimings: Timings = {
  voice: voiceKey(testVoice),
  scenes: { long: spokenTake(TWENTY) },
};
