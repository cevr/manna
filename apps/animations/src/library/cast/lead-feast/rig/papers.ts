import { type Crease, papers } from '@manna/film/style';

const TURN = {
  robe: { at: 0.62, soft: 0.04, toward: 0.25 },
  sleeve: { at: 0.7, soft: 0.25 },
  hand: { at: 0.75, soft: 0.06 },
} as const satisfies Record<string, Crease>;

export const PAPERS = papers({
  skin: { color: '#fdaf72', light: '#fec48e' },
  ear: { color: '#f59d66', light: '#f59d66' },
  hair: { color: '#71442e', light: '#71442e' },
  tunic: { color: '#fde1bc', shade: '#e8c3ad', light: '#fff0d8', crease: TURN.robe },
  sleeve: { color: '#fbe0bb', shade: '#e8c3ad', light: '#fff0d8', crease: TURN.sleeve, rim: 0 },
  sleeveAcross: { color: '#fbddb6', light: '#fde8c8', rim: 0 },
  sleeveRaised: { color: '#f1d2b0', light: '#fbe6c3', rim: 0 },
  mantleSleeve: {
    color: '#608989',
    shade: '#435770',
    light: '#729c99',
    crease: TURN.sleeve,
    rim: 0,
  },
  foot: { color: '#f8a466', light: '#3b2418' },
  hand: { color: '#fdaf72', shade: '#e8906a', light: '#fec48e', crease: TURN.hand },
});

export const TONES = {
  mantle: '#4f7a85',
  mantleShade: '#456079',
  sash: '#fee9c8',
  sashShade: '#c9a39b',
  neck: '#e58a62',
  jaw: '#c8704e',
  chinLine: '#7d482f',
  chinFade: '#a05b38',
  earLight: '#fbd593',
  earLit: '#fcbd84',
  earHollow: '#e07a53',
  earShade: '#ea9060',
  jawShade: '#e27f55',
  jawSoft: '#f2a06c',
  jawRose: '#d5714a',
  earBand: '#4b2e1e',
  strap: '#5c3627',
  sole: '#3b2418',
  hairShade: '#58302a',
  hairLight: '#7b4530',
  creamEdge: '#dcb5a0',
  tealEdge: '#4a6479',
  raisedUnder: '#e9c6a6',
  raisedFold: '#d6b29b',
  creamAcross: '#a37f72',
  creamAcrossInner: '#ecc9a8',
  lapSleeve: '#729c99',
  lapSleeveUnder: '#476c7b',
  creamAcrossFold: '#e1bda0',
  creamAcrossFar: '#ba9387',
} as const satisfies Record<string, `#${string}`>;
