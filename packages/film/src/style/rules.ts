export type Way = 'none' | 'owner' | 'override';

interface Rule {
  readonly says: string;
  readonly source: string;
  readonly way: Way;
}

export const RULES = {
  GreyShade: {
    says: 'a shade is a colour of its own, never the paper greyed or blackened',
    source: 'CRAFT.md rule 12, "Shade with colour, never with black" (owner, 2026-10-12)',
    way: 'none',
  },
  CircleHands: {
    says: 'a hand is a circle of one paper and a share of the head',
    source:
      'character-design.md, K1: "no thumb, no fingers" (owner, 2026-10-12); a hand ends its arm\'s sleeve (look ledger: "they have sleeves and like arms", owner, 2026-10-18)',
    way: 'none',
  },
  KitA: {
    says: 'the face is Kit A: two eyes, two brows and a mouth, placed and sized',
    source: 'character-design.md, K1: "three marks" (Kit A, owner, 2026-10-13)',
    way: 'owner',
  },
  InteriorInk: {
    says: 'no ink inside a figure: one line round the silhouette, none inside it',
    source:
      'director-vision.md, Storybook figures rule 1: "no inner lines but the face\'s, since form is the crease"',
    way: 'owner',
  },
  InnerRim: {
    says: "the rim runs inside a piece's own line, never inside a part laid within it",
    source:
      'RBF journal, round 6: an ear\'s light rim inside the outline (owner: "an inner border")',
    way: 'owner',
  },
  FigureLock: {
    says: 'a locked figure is drawn as the owner kept it, its print the one its lock holds',
    source:
      'ask a92f276635e: "Keep and lock them: the first locked rigs" (owner, 2026-10-17); the aim, to "lock in a rig and a style" (owner, RBF ledger, 2026-10-17)',
    way: 'override',
  },
} as const satisfies Record<string, Rule>;

export type RuleId = keyof typeof RULES;
