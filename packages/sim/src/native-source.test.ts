/**
 * `nativeRefusals` over generated app logs, against a model written here
 * that knows each history by its draws: launches of the app (each a new
 * pid), refusals of a native source in each of One's five forms (a module
 * or a view changed, a module, a method or a view not linked) inside five
 * wrappers (bare, `Error:`, an uncaught promise, a failed call with its
 * stack, an unhandled rejection on a second line), plain lines that come
 * near a refusal without being one, and lines that are no record (the
 * header, the closing count, a string pid, a record with no message,
 * text). The answer is the latest process's refusals, in order: a refusal
 * of an earlier process, before a rebuild or a relaunch, counts for
 * nothing.
 */
import { describe, expect, it } from 'bun:test';
import { Schema } from 'effect';

import { nativeRefusals } from './native-source.ts';

const encode = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

/** A seeded linear congruential stream: a draw below `below`. */
const random = (seed: number) => {
  let s = seed >>> 0;
  return (below: number) => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return Math.floor((s / 4294967296) * below);
  };
};

type Draw = (below: number) => number;

const pick = <A>(draw: Draw, from: ReadonlyArray<A>): A => from[draw(from.length)] as A;

const MODULES = ['natural.Natural', 'voice.Voice', 'dictation.Dictation', 'growth.Growth'];
/** One's refusals of a native source the installed build lacks or holds in another shape. */
const FORMS = [
  (name: string) => `native module ${name} changed; rebuild the app`,
  (name: string) => `native module ${name} is not linked; rebuild the app`,
  (name: string) => `native method ${name}.load is not linked; rebuild the app`,
  (name: string) => `swift view ${name} changed; rebuild the app`,
  (name: string) => `swift view ${name} is not linked; rebuild the app`,
];
const WRAPS = [
  (text: string) => text,
  (text: string) => `Error: ${text}`,
  (text: string) => `Error: Uncaught (in promise, id: 0): "Error: ${text}"`,
  (text: string) => `'Listen failed', { [Error: ${text}] }\n    at anonymous (index.bundle:1:2)`,
  (text: string) => `Possible unhandled rejection\nError: ${text}`,
];
/** Messages that come near a refusal and are none. */
const PLAIN = [
  '[voice] speak utterance=3 skipped=simulator',
  '[natural] install done',
  'Running "main" with {"rootTag":1}',
  'rebuild the app to see native changes',
  'the pods changed: Rebuild the app',
  'native module natural.Natural changed',
  '; rebuilt the app',
];
/** Lines that are no record. */
const NOISE = [
  '',
  'Timestamp               Ty Process[PID:TID]',
  '{"count":12,"finished":1}',
  '{"processID":"77","eventMessage":"native module x changed; rebuild the app"}',
  '{"processID":77}',
  'not json; rebuild the app',
  '[]',
  'null',
];

/** One generated history: its log, the latest process's refusals by the model, and what it drew. */
const history = (draw: Draw) => {
  const lines: Array<string> = [];
  const refused = new Map<number, Array<string>>();
  let pid = 100 + draw(900);
  let latest = -1;
  let launches = 1;
  const forms = new Set<number>();
  const wraps = new Set<number>();
  for (let step = draw(14); step > 0; step -= 1) {
    const kind = draw(10);
    if (kind === 0) {
      pid += 1 + draw(50);
      launches += 1;
    } else if (kind <= 3) {
      const form = draw(FORMS.length);
      const wrap = draw(WRAPS.length);
      forms.add(form);
      wraps.add(wrap);
      const message = WRAPS[wrap]?.(FORMS[form]?.(pick(draw, MODULES)) ?? '') ?? '';
      refused.set(pid, [...(refused.get(pid) ?? []), message]);
      latest = pid;
      lines.push(encode({ timestamp: 't', processID: pid, eventMessage: message }));
    } else if (kind <= 7) {
      latest = pid;
      lines.push(
        encode({ processID: pid, eventMessage: pick(draw, PLAIN), category: 'javascript' }),
      );
    } else lines.push(pick(draw, NOISE));
  }
  const want = refused.get(latest) ?? [];
  const all = [...refused.values()].reduce((sum, each) => sum + each.length, 0);
  return { text: lines.join('\n'), want, launches, stale: all - want.length, forms, wraps };
};

describe('the native sources the app’s latest process refused', () => {
  it('over 500 generated logs, answers exactly the refusals of the last record’s process, in order', () => {
    const draw = random(0xd0c7);
    const seen = { refused: 0, clean: 0, staleOnly: 0, staleAndNew: 0, relaunched: 0 };
    const forms = new Set<number>();
    const wraps = new Set<number>();
    const got: Array<ReadonlyArray<string>> = [];
    const want: Array<ReadonlyArray<string>> = [];
    for (let run = 0; run < 500; run += 1) {
      const drawn = history(draw);
      got.push(nativeRefusals(drawn.text));
      want.push(drawn.want);
      drawn.forms.forEach((form) => forms.add(form));
      drawn.wraps.forEach((wrap) => wraps.add(wrap));
      if (drawn.want.length > 0) seen.refused += 1;
      else seen.clean += 1;
      if (drawn.want.length === 0 && drawn.stale > 0) seen.staleOnly += 1;
      if (drawn.want.length > 0 && drawn.stale > 0) seen.staleAndNew += 1;
      if (drawn.launches > 1) seen.relaunched += 1;
    }
    expect(got).toEqual(want);
    expect(Object.entries(seen).filter(([, count]) => count < 10)).toEqual([]);
    expect([forms.size, wraps.size]).toEqual([FORMS.length, WRAPS.length]);
  });

  it('reads sim-3’s line as a refusal', () => {
    const line = encode({
      processID: 93471,
      subsystem: 'com.facebook.react.log',
      category: 'javascript',
      eventMessage:
        'Error: Uncaught (in promise, id: 0): "Error: native module natural.Natural changed; rebuild the app"',
    });
    expect(nativeRefusals(line)).toHaveLength(1);
  });
});
