/* oxlint-disable effect/noNullish -- the view contract (hsmatch spec A1) gives an absent time, reveal or grade as null, and the literal expectations spell it as the screen reads it. */

/**
 * The word matcher at its seam, against literal expectations worked out by
 * hand from the spec: the stream rules, which word each spoken word lights,
 * what a miss hides and a peek shows, the closed spelling table, numbers by
 * value, and the suggested grade. `matcher.property.test.ts` holds it to an
 * independent model over generated command histories.
 */

import { describe, expect, it } from 'bun:test';
import { Formatter } from 'effect';

import {
  createMatcher,
  matcherView,
  updateMatcher,
  type Command,
  type Cue,
  type MatcherState,
  type SpokenWord,
} from './matcher';

/** Words 100 ms apart, each lasting 80 ms, from `at`. */
const words = (text: string, at = 0): SpokenWord[] =>
  text
    .split(' ')
    .filter(Boolean)
    .map((word, i) => ({ text: word, start: at + i * 100, end: at + i * 100 + 80 }));

const snapshot = (revision: number, final: string, tentative = ''): Command => ({
  type: 'recognition',
  revision,
  finalWords: words(final),
  tentativeWords: words(tentative, words(final).length * 100),
});

const play = (verse: string, commands: readonly Command[], cue: Cue = 'none'): MatcherState =>
  commands.reduce(updateMatcher, createMatcher(verse, cue));

const statuses = (state: MatcherState) => matcherView(state).marks.map((mark) => mark.status);

const finished = (verse: string, spoken: string, cue: Cue = 'none') =>
  matcherView(play(verse, [snapshot(0, spoken), { type: 'finish' }], cue));

describe('recognition snapshots', () => {
  it('replaces the tentative tail with each snapshot, down to nothing', () => {
    const verse = 'Fear thou not';
    const guessed = play(verse, [snapshot(0, '', 'fear thou')]);
    expect(statuses(guessed)).toEqual(['tentative', 'tentative', 'pending']);
    const retracted = updateMatcher(guessed, snapshot(1, '', ''));
    expect(statuses(retracted)).toEqual(['pending', 'pending', 'pending']);
    const replaced = updateMatcher(guessed, snapshot(1, '', 'not'));
    expect(statuses(replaced)).toEqual(['pending', 'pending', 'tentative']);
  });

  it('does not double a repeated snapshot, or a tail promoted to final', () => {
    const verse = 'fear fear thou';
    const state = play(verse, [
      snapshot(0, '', 'fear'),
      snapshot(1, '', 'fear'),
      snapshot(2, 'fear'),
      snapshot(3, 'fear'),
    ]);
    expect(statuses(state)).toEqual(['matched', 'pending', 'pending']);
    expect(matcherView(state).extraWordCount).toBe(0);
  });

  it('ignores a stale or repeated revision, and a snapshot that rewrites the final words', () => {
    const start = play('fear thou not', [snapshot(4, 'fear', 'thou')]);
    for (const command of [
      snapshot(4, 'fear thou'),
      snapshot(3, 'fear thou'),
      snapshot(5, 'thou'),
      snapshot(5, ''),
      {
        type: 'recognition',
        revision: 5,
        finalWords: [{ text: 'fear', start: 1, end: 80 }],
        tentativeWords: [],
      } satisfies Command,
    ]) {
      expect(statuses(updateMatcher(start, command))).toEqual(['matched', 'tentative', 'pending']);
    }
    const rejected = updateMatcher(start, snapshot(5, 'thou'));
    expect(statuses(updateMatcher(rejected, snapshot(5, 'fear thou not')))).toEqual([
      'matched',
      'matched',
      'matched',
    ]);
  });

  it('rejects a whole snapshot with one bad word or time, and keeps that revision open', () => {
    const start = createMatcher('fear thou');
    const pending = matcherView(start);
    const bad: SpokenWord[] = [
      { text: 'thou', start: -1, end: 5 },
      { text: 'thou', start: 300, end: 299 },
      { text: 'thou', start: Number.NaN, end: 300 },
      { text: 'thou', start: 300, end: Number.POSITIVE_INFINITY },
      { text: '', start: 300, end: 380 },
      { text: '?!', start: 300, end: 380 },
      { text: 'thou art', start: 300, end: 380 },
    ];
    for (const word of bad) {
      const command: Command = {
        type: 'recognition',
        revision: 0,
        finalWords: [{ text: 'fear', start: 0, end: 80 }],
        tentativeWords: [word],
      };
      expect(matcherView(updateMatcher(start, command)), Formatter.format(word)).toEqual(pending);
    }
    const unordered = updateMatcher(start, {
      type: 'recognition',
      revision: 0,
      finalWords: [{ text: 'fear', start: 100, end: 180 }],
      tentativeWords: [{ text: 'thou', start: 50, end: 280 }],
    });
    expect(matcherView(unordered)).toEqual(pending);
    for (const revision of [-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(matcherView(updateMatcher(start, snapshot(revision, 'fear')))).toEqual(pending);
    }
    const overlapping = updateMatcher(start, {
      type: 'recognition',
      revision: 0,
      finalWords: [{ text: 'fear', start: 10, end: 300 }],
      tentativeWords: [{ text: 'thou', start: 10, end: 20 }],
    });
    expect(matcherView(overlapping).marks.map((mark) => mark.time)).toEqual([
      { start: 10, end: 300 },
      { start: 10, end: 20 },
    ]);
  });

  it('keeps the words of an accepted snapshot when the caller changes its arrays', () => {
    const command = snapshot(0, 'fear thou');
    const state = updateMatcher(createMatcher('fear thou'), command);
    if (command.type === 'recognition') {
      const first = command.finalWords[0];
      if (first) Object.assign(first, { text: 'changed' });
      Object.assign(command, { finalWords: [] });
    }
    expect(statuses(state)).toEqual(['matched', 'matched']);
  });

  it('ignores recognition after finish, and finishing twice changes nothing', () => {
    const done = play('fear thou not', [snapshot(0, 'fear', 'thou not'), { type: 'finish' }]);
    expect(statuses(done)).toEqual(['matched', 'miss', 'miss']);
    expect(matcherView(updateMatcher(done, snapshot(1, 'fear thou not')))).toEqual(
      matcherView(done),
    );
    expect(matcherView(updateMatcher(done, { type: 'finish' }))).toEqual(matcherView(done));
  });

  it('a fresh matcher carries nothing from an earlier attempt', () => {
    play(
      'fear thou',
      [snapshot(0, 'thou'), { type: 'peek', index: 0 }, { type: 'finish' }],
      'full',
    );
    expect(matcherView(createMatcher('fear thou'))).toEqual({
      marks: [
        { index: 0, status: 'pending', time: null, revealed: null },
        { index: 1, status: 'pending', time: null, revealed: null },
      ],
      extraWordCount: 0,
      peekCount: 0,
      suggestedGrade: null,
      finished: false,
    });
  });
});

describe('which source word each spoken word lights', () => {
  it('consumes each spoken occurrence once, at the earliest repeated word', () => {
    const view = finished('holy holy holy', 'holy');
    expect(view.marks.map((mark) => mark.status)).toEqual(['matched', 'miss', 'miss']);
    expect(view.marks[0]?.time).toEqual({ start: 0, end: 80 });
  });

  it('a later final word proves the skipped words missed; the rest stay pending', () => {
    const state = play('Fear thou not; for I am with thee', [snapshot(0, 'fear not', 'for')]);
    expect(statuses(state)).toEqual([
      'matched',
      'miss',
      'matched',
      'tentative',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
  });

  it('a tentative word never matches before the last final match, nor proves a miss', () => {
    const state = play('fear thou not', [snapshot(0, 'not', 'fear thou')]);
    expect(statuses(state)).toEqual(['miss', 'miss', 'matched']);
    const ahead = play('fear thou not', [snapshot(0, 'fear', 'not')]);
    expect(statuses(ahead)).toEqual(['matched', 'pending', 'tentative']);
  });

  it('places a repeated word at its earliest source word, keeping the most words matched', () => {
    const state = play('I am with thee I am thy God', [snapshot(0, 'I am thy God')]);
    expect(statuses(state)).toEqual([
      'matched',
      'matched',
      'miss',
      'miss',
      'miss',
      'miss',
      'matched',
      'matched',
    ]);
  });

  it('realigns the final words as more arrive, turning an earlier miss into a match', () => {
    const early = play('fear not', [snapshot(0, 'not')]);
    expect(statuses(early)).toEqual(['miss', 'matched']);
    const later = matcherView(updateMatcher(early, snapshot(1, 'not fear not')));
    expect(later.marks.map((mark) => [mark.status, mark.time])).toEqual([
      ['matched', { start: 100, end: 180 }],
      ['matched', { start: 200, end: 280 }],
    ]);
    expect(later.extraWordCount).toBe(1);
  });

  it('counts finalized spoken words left unmatched as extras, never tentative ones', () => {
    const view = matcherView(play('fear thou', [snapshot(0, 'fear oh thou', 'well well')]));
    expect(view.extraWordCount).toBe(1);
    expect(view.marks.map((mark) => mark.status)).toEqual(['matched', 'matched']);
  });

  it('marks follow source words, apart from runs with no letter or number', () => {
    const view = matcherView(createMatcher('¶ [Fear] thou — not!'));
    expect(view.marks.map((mark) => mark.index)).toEqual([0, 1, 2]);
  });

  it('matches across case and punctuation, but not across a changed word', () => {
    expect(finished('¶ [Fear] THOU not;', 'FEAR thou Not').marks.map((m) => m.status)).toEqual([
      'matched',
      'matched',
      'matched',
    ]);
    for (const [verse, spoken] of [
      ['thy', 'the'],
      ['thou', 'you'],
      ['thee', 'you'],
      ['restoreth', 'restored'],
      ['want', 'wont'],
      ['righteousness', 'unrighteousness'],
      ['showers', 'shewers'],
    ] as const) {
      expect(finished(verse, spoken).marks[0]?.status, `${verse}/${spoken}`).toBe('miss');
    }
  });
});

describe('the closed spelling table', () => {
  it('matches an archaic spelling and its modern one, both ways', () => {
    for (const [verse, spoken] of [
      ['shewed', 'showed'],
      ['showed', 'shewed'],
      ['throughly', 'thoroughly'],
      ['O', 'oh'],
      ['leadeth', 'ledeth'],
    ] as const) {
      expect(finished(verse, spoken).suggestedGrade, `${verse}/${spoken}`).toBe(3);
    }
  });

  it('a compound lights both of its words with one spoken word’s time', () => {
    const view = matcherView(play('for ever', [snapshot(0, 'go forever')]));
    expect(view.marks.map((mark) => [mark.status, mark.time])).toEqual([
      ['matched', { start: 100, end: 180 }],
      ['matched', { start: 100, end: 180 }],
    ]);
    expect(view.extraWordCount).toBe(1);
    const back = matcherView(play("for his name's sake", [snapshot(0, 'for his namesake')]));
    expect(back.marks.map((mark) => [mark.status, mark.time])).toEqual([
      ['matched', { start: 0, end: 80 }],
      ['matched', { start: 100, end: 180 }],
      ['matched', { start: 200, end: 280 }],
      ['matched', { start: 200, end: 280 }],
    ]);
    const spoken = matcherView(play('namesake', [snapshot(0, "name's sake")]));
    expect(spoken.marks[0]?.time).toEqual({ start: 0, end: 180 });
  });
});

describe('numbers match by value', () => {
  const same = (verse: string, spoken: string) => {
    const view = finished(verse, spoken);
    return view.suggestedGrade === 3 && view.extraWordCount === 0;
  };

  it('holds spelled numbers and their numerals equal, both ways', () => {
    for (const [phrase, numeral] of [
      ['zero', '0'],
      ['seven', '7'],
      ['forty and two', '42'],
      ['one and twenty', '21'],
      ['twenty three', '23'],
      ['twenty-three', '23'],
      ['threescore and ten', '70'],
      ['fourscore', '80'],
      ['an hundred and twenty', '120'],
      ['eleven hundred', '1100'],
      ['a thousand two hundred and threescore', '1260'],
      ['sixscore thousand', '120000'],
      ['an hundred and forty and four thousand', '144000'],
      ['one thousand and one', '1001'],
      ['two million five', '2000005'],
      [
        'nine quadrillion seven trillion one hundred ninety nine billion two hundred fifty four million seven hundred forty thousand nine hundred ninety one',
        '9007199254740991',
      ],
    ] as const) {
      expect(same(phrase, numeral), `${phrase} = ${numeral}`).toBe(true);
      expect(same(numeral, phrase), `${numeral} = ${phrase}`).toBe(true);
    }
  });

  it('matches two spellings of one value', () => {
    expect(same('forty and two', 'forty-two')).toBe(true);
    expect(same('threescore and ten', 'seventy')).toBe(true);
  });

  it('never joins digits or words into a different number', () => {
    for (const [verse, spoken] of [
      ['one two', '12'],
      ['one two', 'twelve'],
      ['two three', '23'],
      ['14', 'forty'],
      ['nineteen', 'ninety'],
      ['1st', 'one'],
      ['one twenty', '21'],
      ['one hundred hundred', '10000'],
    ] as const) {
      expect(same(verse, spoken), `${verse} / ${spoken}`).toBe(false);
    }
  });

  it('does not round a value past the largest safe integer back into the domain', () => {
    const over = '9007199254740993';
    const spelled =
      'nine quadrillion seven trillion one hundred ninety nine billion two hundred fifty four million seven hundred forty thousand nine hundred ninety two';
    expect(same(over, spelled)).toBe(false);
    expect(same('ten quadrillion', '10000000000000000')).toBe(false);
  });

  it('keeps the right words of a wrong number', () => {
    const view = finished('forty and two', 'forty and three');
    expect(view.marks.map((mark) => mark.status)).toEqual(['matched', 'matched', 'miss']);
  });
});

describe('misses and peeks', () => {
  it('shows no text for a missed or pending word, and only the peeked word after a peek', () => {
    const state = play('Fear thou not; dismay', [snapshot(0, 'fear not')]);
    expect(Formatter.format(matcherView(state))).not.toContain('thou');
    expect(Formatter.format(matcherView(state))).not.toContain('dismay');
    const peeked = updateMatcher(state, { type: 'peek', index: 1 });
    expect(matcherView(peeked).marks.map((mark) => mark.revealed)).toEqual([
      null,
      'thou',
      null,
      null,
    ]);
    expect(Formatter.format(matcherView(peeked))).not.toContain('dismay');
  });

  it('reveals the source word as written, case and punctuation kept', () => {
    const state = play('Fear Thou, not', [snapshot(0, 'fear not'), { type: 'peek', index: 1 }]);
    expect(matcherView(state).marks[1]).toEqual({
      index: 1,
      status: 'peek',
      time: null,
      revealed: 'Thou,',
    });
  });

  it('peeks only a miss, and counts each word once', () => {
    const state = play('fear thou not now', [snapshot(0, 'fear not')]);
    for (const index of [0, 3, -1, 4, 0.5, 2]) {
      expect(matcherView(updateMatcher(state, { type: 'peek', index }))).toEqual(
        matcherView(state),
      );
    }
    const twice = play('fear thou not now', [
      snapshot(0, 'fear not'),
      { type: 'peek', index: 1 },
      { type: 'peek', index: 1 },
    ]);
    expect(matcherView(twice).peekCount).toBe(1);
  });

  it('remembers a peek after the word is said, and after finish', () => {
    const state = play('fear thou not', [
      snapshot(0, 'fear not'),
      { type: 'peek', index: 1 },
      snapshot(1, 'fear not thou'),
    ]);
    expect(statuses(state)).toEqual(['matched', 'matched', 'pending']);
    expect(matcherView(state).peekCount).toBe(1);
    const realigned = play('fear thou not thou', [
      snapshot(0, 'fear not'),
      { type: 'peek', index: 1 },
      snapshot(1, 'fear not thou'),
      { type: 'finish' },
    ]);
    expect(statuses(realigned)).toEqual(['matched', 'peek', 'matched', 'matched']);
    expect(matcherView(realigned).peekCount).toBe(1);
    const late = updateMatcher(
      play('fear thou not', [snapshot(0, 'fear not'), { type: 'finish' }]),
      {
        type: 'peek',
        index: 1,
      },
    );
    expect(matcherView(late).marks[1]?.revealed).toBe('thou');
  });
});

describe('the suggested grade', () => {
  const ten = 'one two three four five six seven eight nine ten';

  it('suggests nothing before finish', () => {
    expect(matcherView(play(ten, [snapshot(0, ten)])).suggestedGrade).toBeNull();
  });

  it('suggests Good for a clean recall with no help', () => {
    expect(finished(ten, ten).suggestedGrade).toBe(3);
  });

  it('suggests Hard at exactly 90 per cent, and Again below it', () => {
    expect(finished(ten, 'one two three four five six seven eight nine').suggestedGrade).toBe(2);
    expect(finished(ten, 'one two three four five six seven eight').suggestedGrade).toBe(1);
  });

  it('suggests Hard for one slip in Isaiah 41:10, as the prototype does', () => {
    const verse =
      'Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee; yea, I will uphold thee with the right hand of my righteousness.';
    const spoken = verse.replace('dismayed', 'afraid');
    expect(finished(verse, spoken).suggestedGrade).toBe(2);
  });

  it('caps a clean recall at Hard for an extra word, a peek or a cue', () => {
    expect(finished(ten, `${ten} amen`).suggestedGrade).toBe(2);
    expect(finished(ten, ten, 'initials').suggestedGrade).toBe(2);
    expect(finished(ten, ten, 'full').suggestedGrade).toBe(2);
    const helped = play(ten, [
      snapshot(0, 'one two three four five six seven eight nine'),
      { type: 'finish' },
      { type: 'peek', index: 9 },
    ]);
    expect(matcherView(helped).suggestedGrade).toBe(2);
    const corrected = play('forever thou for', [
      snapshot(0, 'for'),
      { type: 'peek', index: 0 },
      snapshot(1, 'for ever thou for'),
      { type: 'finish' },
    ]);
    expect(statuses(corrected)).toEqual(['matched', 'matched', 'matched']);
    expect(matcherView(corrected).extraWordCount).toBe(0);
    expect(matcherView(corrected).suggestedGrade).toBe(2);
  });

  it('suggests Again for nothing said, and for a verse with no words', () => {
    expect(matcherView(play(ten, [{ type: 'finish' }])).suggestedGrade).toBe(1);
    expect(matcherView(play('¶ []', [{ type: 'finish' }])).suggestedGrade).toBe(1);
    expect(finished(ten, 'fear').suggestedGrade).toBe(1);
  });

  it('grades the final words only, never the tentative tail', () => {
    const state = play(ten, [snapshot(0, '', ten), { type: 'finish' }]);
    expect(matcherView(state).suggestedGrade).toBe(1);
  });
});
