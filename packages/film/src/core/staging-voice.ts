import type { Cast } from './schema.ts';

export const STAGING_VOICE_ID = 'uklw0mSGyyFcEsdp2z45';

export const STAGING_VOICE_PACE = 156;

export const stagingVoice = {
  model: 'eleven_v4',
  settings: { stability: 0.5, similarity: 0.75 },
  voices: [{ name: 'lead', voiceId: STAGING_VOICE_ID }],
} as const satisfies Cast;
