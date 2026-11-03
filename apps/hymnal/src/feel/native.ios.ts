import { Option } from 'effect';

import { Voice } from '../../native/feel/Voice.swift';
import type { VoiceNative } from './sound';

export const voiceNative: Option.Option<VoiceNative> = Option.some(Voice);
