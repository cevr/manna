export const PALETTE = {
  paper: '#fff9e0',
  band: '#fff3c2',
  wheat: '#ffefae',
  ink: '#12354e',
  soft: '#4d687a',
  accent: '#7a6813',
  sky: '#bac9db',
  night: '#12354e',
  nightInk: '#ffefae',
  nightAccent: '#ffefae',
  nightSoft: '#b8b791',
  nightRule: '#465e63',
  duskGold: '#f6c98a',
  duskRose: '#d99a86',
  duskLate: '#6e6683',
  duskDeep: '#93620f',
  nightPanel: '#1b4262',
} as const;

export type Role = keyof typeof PALETTE;
