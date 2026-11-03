export interface Reveal {
  readonly shown: boolean;
  readonly from: number;
  readonly held?: true;
}

export const travel = 8;

export const hidden = (rest: number): Reveal => ({ shown: false, from: rest });

export const revealAt = (state: Reveal, scroll: number, rest: number): Reveal => {
  'worklet';
  if (state.held) return { shown: state.shown, from: scroll, held: true };
  if (scroll <= rest) return { shown: false, from: scroll };
  if (state.shown) {
    if (scroll - state.from >= travel) return { shown: false, from: scroll };
    return { shown: true, from: Math.min(state.from, scroll) };
  }
  if (state.from - scroll >= travel) return { shown: true, from: scroll };
  return { shown: false, from: Math.max(state.from, scroll) };
};

export const jumped = (state: Reveal, scroll: number): Reveal => {
  'worklet';
  return { shown: state.shown, from: scroll, held: true };
};

export const touched = (state: Reveal, scroll: number, rest: number): Reveal => {
  'worklet';
  if (!state.held) return state;
  return { shown: state.shown && scroll > rest, from: scroll };
};

export const inReach = (state: Reveal, scroll: number, rest: number): boolean => {
  'worklet';
  return state.shown && scroll > rest;
};

export const shownHeight = (
  progress: number,
  height: number,
  scroll: number,
  rest: number,
): number => {
  'worklet';
  if (progress <= 0 || scroll <= rest) return 0;
  return Math.max(0, Math.max(rest - scroll, (progress - 1) * height) + height);
};
