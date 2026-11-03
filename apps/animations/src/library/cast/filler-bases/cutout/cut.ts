import type { HiddenEntry } from '@manna/film/tools';
import { bustCut } from '../../../cutout/bust.ts';
import { CUT_AWAY, KEEP_REST } from '../../../cutout/prompts.ts';
import { FAR } from '../../../cutout/rules.ts';
import { cutTable } from '../../../cutout/table.ts';
import { FRAMES, type FramedView } from './frames.ts';

export { FRAMES };

const POSES_1 = bustCut({
  line: [
    [FAR, 223],
    [-1, 223],
  ],
  pivot: [151, 223],
});

const POSES_2 = bustCut({
  line: [
    [FAR, 231],
    [200, 231],
    [164, 224],
    [164, 216],
    [160, 216],
    [150, 218],
    [140, 219],
    [117, 220],
    [-1, 220],
  ],
  pivot: [140, 219],
});

const POSES_3 = bustCut({
  line: [
    [FAR, 220],
    [-1, 220],
  ],
  pivot: [150, 220],
});

const POSES_4 = bustCut({
  line: [
    [FAR, 232],
    [207, 232],
    [165, 219],
    [165, 217],
    [160, 217],
    [150, 219],
    [140, 220],
    [-1, 220],
  ],
  pivot: [141, 220],
});

const INK = [16, 4, 0, 255] as const;

const behindHead = (pronoun: 'his' | 'her', head: string, turn: string): HiddenEntry => ({
  moving: ['head'],
  prompt: `${CUT_AWAY} ${pronoun} head (${head}) was cut away to make a cut-out puppet.${turn} Repaint ONLY the magenta area, as what lies behind ${pronoun} head: ${pronoun} neck rising from ${pronoun} collar as a plain column of skin to about where the mouth was, its two sides closed by the same thick dark brown-black outline as the rest of the figure, its top simply rounded and closed by the same outline, in exactly the same skin colour and soft shading as the neck below. Everywhere else in the magenta area becomes the plain cream paper. There is no head now: no hair, no face, no ears, nothing magenta left. ${KEEP_REST}`,
});

const HIDDEN_ENTRIES = {
  'poses-1': behindHead('his', 'his dark hair, face and ears', ' He faces the viewer.'),
  'poses-2': behindHead(
    'her',
    'her dark hair, its tie hanging at her left, her face and ears',
    ' She faces the viewer.',
  ),
  'poses-3': behindHead('his', 'his pale hair, face and ears', ' He faces the viewer.'),
  'poses-4': behindHead(
    'her',
    'her pale hair, its bun at her left, her face and ears',
    ' She faces the viewer.',
  ),
} as const satisfies Readonly<Record<FramedView, HiddenEntry>>;

export const { CUTS, cutOptionsFor, HIDDEN, paperOf } = cutTable({
  frames: FRAMES,
  views: {
    'poses-1': { cut: POSES_1, figure: 'bust' },
    'poses-2': { cut: POSES_2, figure: 'bust' },
    'poses-3': { cut: POSES_3, figure: 'bust' },
    'poses-4': { cut: POSES_4, figure: 'bust' },
  },
  hidden: HIDDEN_ENTRIES,
  ink: INK,
});
