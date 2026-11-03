import type { Look } from '../look.ts';
import { STYLE, type Style } from '../palette.ts';
import { bold } from './bold/index.ts';
import { cutpaper } from './cutpaper/index.ts';
import { engraving } from './engraving/index.ts';
import { painterly } from './painterly/index.ts';
import { papercut, papercutgl } from './papercut/index.ts';
import { ps1 } from './ps1/index.ts';
import { rive, rivegl } from './rive/index.ts';

const LOOKS: Readonly<Record<Style, Look>> = {
  cutpaper,
  ps1,
  painterly,
  engraving,
  bold,
  rive,
  rivegl,
  papercut,
  papercutgl,
};

export const lookOf = (): Look => LOOKS[STYLE];
