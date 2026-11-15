import type { Option } from 'effect';

/** A voice the device offers; quality 1 default, 2 enhanced, 3 premium. */
export interface VoiceInfo {
  readonly id: string;
  readonly language: string;
  readonly name: string;
  readonly quality: number;
  readonly novelty: boolean;
  readonly personal: boolean;
}

/** The system voice a reading asks for: the best English voice that is neither novelty nor personal; none when none is eligible. */
export declare const bestVoice: (voices: ReadonlyArray<VoiceInfo>) => Option.Option<VoiceInfo>;
