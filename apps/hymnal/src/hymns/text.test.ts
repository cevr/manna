import { describe, expect, it } from 'bun:test';
import { topicOf } from '@manna/hymnal/hymn';
import { Option } from 'effect';

import { readHymns, readTopics } from '../../vite/words';
import { hymnAt, hymns, type Section } from './hymns';

const topics = readTopics();

describe("the hymns' topics", () => {
  it('give each of the 695 hymns its compiled topic, a trimmed name with no control character', () => {
    expect(hymns.length).toBe(695);
    const wrong = hymns.filter(
      (hymn) =>
        hymn.topic.length === 0 ||
        hymn.topic !== hymn.topic.trim() ||
        // oxlint-disable-next-line no-control-regex -- the rule is "no control character".
        /[\u0000-\u001f\u007f]/.test(hymn.topic) ||
        hymn.topic !==
          Option.getOrUndefined(Option.map(topicOf(topics, hymn.number), (topic) => topic.name)),
    );
    expect(wrong.map((hymn) => `${hymn.number}: [${hymn.topic}]`)).toEqual([]);
  });
});

const laidOut = (number: number): string =>
  Option.match(hymnAt(String(number)), {
    onNone: () => 'none',
    onSome: (hymn) => hymn.sections.map(named).join(' '),
  });

const named = (section: Section): string => {
  if (section.kind === 'stanza') return `S${section.n}`;
  return `R${section.stanza}`;
};

describe('the refrain binding', () => {
  it('binds each refrain to its stanza by the hymn’s refrain order', () => {
    expect({
      'after-each': laidOut(78),
      'first-and-after-each': [laidOut(93), laidOut(121)],
      'before-each': laidOut(349),
      'first-and-last': laidOut(172),
      'after-last': laidOut(262),
      none: laidOut(481),
    }).toEqual({
      'after-each': 'S1 R1 S2 R2 S3 R3 S4 R4',
      'first-and-after-each': ['R0 S1 R1 S2 R2 S3 R3 S4 R4', 'R0 S1 R1 S2 R2 S3 R3'],
      'before-each': 'R1 S1 R2 S2 R3 S3',
      'first-and-last': 'R0 S1 S2 S3 S4 R0',
      'after-last': 'S1 S2 R0',
      none: 'S1',
    });
  });

  it('binds every refrain of the after-each hymns to the stanza sung before it', () => {
    const afterEach = new Set(
      readHymns()
        .filter((hymn) => hymn.refrain?.order === 'after-each')
        .map((hymn) => hymn.number),
    );
    const wrong = hymns
      .filter((hymn) => afterEach.has(hymn.number))
      .filter((hymn) =>
        hymn.sections.some((section, at) => {
          if (section.kind !== 'refrain') return false;
          const before = hymn.sections[at - 1];
          return before?.kind !== 'stanza' || before.n !== section.stanza;
        }),
      )
      .map((hymn) => hymn.number);
    expect(afterEach.size).toBe(188);
    expect(wrong).toEqual([]);
  });
});
