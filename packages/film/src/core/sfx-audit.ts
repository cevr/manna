import type { Generated, Library } from './sfx.ts';

type Verdict = 'code-sure' | 'code-try' | 'realism';

export const VERDICT_LABEL: Record<Verdict, string> = {
  'code-sure': 'code can make this (sure)',
  'code-try': 'code can make this (try)',
  realism: 'needs realism',
};

interface Rule {
  readonly verdict: Verdict;
  readonly reason: string;
  readonly words: ReadonlySet<string>;
}

const RULES: ReadonlyArray<Rule> = [
  {
    verdict: 'realism',
    reason: 'voices, creatures or life far off',
    words: new Set([
      'voice',
      'voices',
      'talk',
      'talking',
      'murmur',
      'murmuring',
      'crowd',
      'crowded',
      'people',
      'audience',
      'words',
      'bird',
      'birds',
      'birdsong',
      'songbirds',
      'chirp',
      'chirping',
      'wing',
      'wings',
      'donkey',
      'footstep',
      'footsteps',
      'sandals',
      'town',
      'city',
      'market',
    ]),
  },
  {
    verdict: 'realism',
    reason: 'a handled texture',
    words: new Set([
      'rustle',
      'rustling',
      'crackle',
      'crackling',
      'scratch',
      'scratching',
      'scrape',
      'scraped',
      'shuffle',
      'shuffling',
      'flutter',
      'flap',
      'flapping',
      'snap',
      'snapping',
      'tear',
      'torn',
      'rip',
      'flip',
      'flipped',
      'slide',
      'sliding',
      'squeak',
      'squeaky',
      'scrub',
      'scrubbing',
      'punch',
      'punches',
      'pull',
      'pulled',
      'sewing',
      'loom',
      'weave',
      'weaving',
      'clink',
      'clinking',
      'clatter',
      'clattering',
    ]),
  },
  {
    verdict: 'code-try',
    reason: 'a borderline texture',
    words: new Set(['creak', 'creaking', 'rumble', 'roll', 'rolled']),
  },
  {
    verdict: 'code-sure',
    reason: 'a shape code makes',
    words: new Set([
      'whoosh',
      'swish',
      'swept',
      'hiss',
      'hissing',
      'sizzle',
      'knock',
      'thud',
      'thuds',
      'thump',
      'bang',
      'bangs',
      'tap',
      'tick',
      'click',
      'chime',
      'bell',
      'ring',
      'tone',
      'drone',
      'hum',
      'rise',
      'riser',
      'wind',
      'breeze',
      'rain',
      'drip',
      'drips',
    ]),
  },
  {
    verdict: 'realism',
    reason: 'a handled material',
    words: new Set([
      'paper',
      'cloth',
      'fabric',
      'linen',
      'robe',
      'ribbon',
      'leaves',
      'reeds',
      'straw',
      'canvas',
      'thread',
    ]),
  },
];

const UNMATCHED = { verdict: 'code-try', reason: 'no rule matched' } as const;

interface Audited {
  readonly verdict: Verdict;
  readonly reason: string;
  readonly words: ReadonlyArray<string>;
}

const auditPrompt = (prompt: string): Audited => {
  const words = prompt.toLowerCase().split(/[^a-z]+/);
  for (const rule of RULES) {
    const held = [...new Set(words.filter((word) => rule.words.has(word)))];
    if (held.length > 0) return { verdict: rule.verdict, reason: rule.reason, words: held };
  }
  return { ...UNMATCHED, words: [] };
};

interface AuditedSound {
  readonly name: string;
  readonly entry: Generated;
  readonly audited: Audited;
}

export const auditLibrary = (library: Library): ReadonlyArray<AuditedSound> =>
  Object.entries(library).flatMap(([name, entry]): ReadonlyArray<AuditedSound> => {
    if (entry.kind !== 'generated') return [];
    return [{ name, entry, audited: auditPrompt(entry.prompt) }];
  });
