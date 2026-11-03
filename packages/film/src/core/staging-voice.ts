import type { Cast } from './schema.ts';

/**
 * ElevenLabs' designed voice "First the Blade staging" (A1 of the owner's
 * picks). On eleven_v4 it reads about 156 words a minute of its own, inside
 * the delivery rules' 150–165 (measured 2026-10-14; v4 takes no speed, so the
 * pace is the voice's).
 */
export const STAGING_VOICE_ID = 'uklw0mSGyyFcEsdp2z45';

/** The staging voice's own pace on eleven_v4, in words a minute (measured 2026-10-14). */
export const STAGING_VOICE_WORDS_PER_MINUTE = 156;

/**
 * The staging voice as a film's `voice.ts` reads it: one narrator, `lead`,
 * through text-to-dialogue on eleven_v4, so a turn (`{@lead}`) and a cast's
 * neighbour stay the same voice and a beat is one take.
 */
export const stagingVoice = {
  model: 'eleven_v4',
  settings: { stability: 0.5, similarity: 0.75 },
  voices: [{ name: 'lead', voiceId: STAGING_VOICE_ID }],
} as const satisfies Cast;
