import { describe, expect, test } from 'bun:test';
import { Option, Schema } from 'effect';
import { EncoderName, encoderCandidates, encoderNamed } from './encoder.ts';

describe('encoderCandidates', () => {
  test('a render left to the default runs on the hardware encoder only', () => {
    expect(encoderCandidates(Option.none())).toEqual([{ _tag: 'Hardware' }]);
  });

  test('--encoder names the one encoder: software is the one way the Mac renders in software', () => {
    expect(encoderCandidates(Option.some(encoderNamed('software')))).toEqual([
      { _tag: 'Software' },
    ]);
    expect(encoderCandidates(Option.some(encoderNamed('hardware')))).toEqual([
      { _tag: 'Hardware' },
    ]);
  });
});

describe('EncoderName', () => {
  test('is hardware or software, nothing else', () => {
    expect(EncoderName.literals).toEqual(['hardware', 'software']);
    expect(Schema.is(EncoderName)('gpu')).toBe(false);
  });
});
