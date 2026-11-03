const SKILL = `${import.meta.dir}/../../.claude/skills/film`;
const CRAFT = `${SKILL}/CRAFT.md`;
const VISION = `${SKILL}/reference/director-vision.md`;

export const JUDGE_RULES = [
  { file: CRAFT, heading: '## 3. Two registers', registers: [] },
  { file: CRAFT, heading: '## 12. The look', registers: [] },
  { file: VISION, heading: '### Palette logic', registers: [] },
  { file: VISION, heading: '### Colour script per act', registers: [] },
  { file: VISION, heading: '### Paper, light, texture', registers: [] },
  { file: VISION, heading: '## What we never do', registers: [] },
  { file: CRAFT, heading: '## 5. Human scale', registers: ['STORY'] },
  { file: VISION, heading: '### Figures, scale, hands and faces', registers: ['STORY'] },
  { file: VISION, heading: '## Camera and staging grammar', registers: ['STORY'] },
  { file: CRAFT, heading: '## 1. Words off the picture', registers: ['IDEA'] },
  { file: CRAFT, heading: '## 8. Repetition as layout', registers: ['IDEA'] },
  { file: VISION, heading: '### Type', registers: ['IDEA'] },
] as const;

const CHARACTERS = `${SKILL}/reference/character-design.md`;

export const CRITIQUE_RULES = [
  { file: CHARACTERS, heading: '## The look these rules assume (K1)' },
  { file: CHARACTERS, heading: '### 2.1 The grammar every figure shares' },
  { file: VISION, heading: '### Figures, scale, hands and faces' },
  { file: CRAFT, heading: '## 12. The look' },
] as const;
