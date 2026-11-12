/* oxlint-disable effect/noNullish -- the model writes the hsfirst spec's rules out as plain branches over the views' nulls, apart from the flow's code, so the two cannot share a mistake. */

/**
 * The first minute's flow, modelled from the hsfirst spec's rule table
 * apart from `src/first/flow.ts`: the property test plays the same world
 * (the reader's taps, the voice's readings, Say it's recitals and the
 * garden) into both and compares the phase, and which recital the screen
 * may show as the phase's own, after each event.
 *
 * - The flow begins at the welcome (hsintro O1). Its `Begin` shows how a
 *   verse grows and its `Skip` shows hear; how a verse grows' `Plant your
 *   first verse` shows hear. Nothing the voice, Say it or the garden does
 *   moves either screen, and their taps are offered only on them.
 * - Hear goes on to letters at Next, or when a reading ends finished; a
 *   reading that ends any other way stays (rows 6 and 7).
 * - Letters goes on to alone once a recital pressed in letters ends
 *   finished; one that is not heard stays (row 8).
 * - Alone goes on to Planted once the garden holds the passage's plant,
 *   whenever that is (rows 9 to 11).
 * - Planted stays (row 12 is the root's).
 * - The screen shows a recital's marks only for one pressed in the phase on
 *   screen; a recital from before the flow, or from an earlier phase, is
 *   no phase's own.
 */

export type ModelPhase = 'welcome' | 'grows' | 'hear' | 'letters' | 'alone' | 'planted';

export type ModelEnding = 'finished' | 'stopped' | 'off' | 'interrupted' | 'failed';

export type WorldEvent =
  | { readonly t: 'begin' }
  | { readonly t: 'skip' }
  | { readonly t: 'plant' }
  | { readonly t: 'next' }
  | { readonly t: 'read' }
  | { readonly t: 'voiceEnd'; readonly ending: ModelEnding }
  | { readonly t: 'press' }
  | { readonly t: 'end'; readonly finished: boolean }
  | { readonly t: 'garden' };

/** What the screen sees of the world: the voice's last ending, Say it's latest recital, and the garden. */
export interface World {
  voiceEnded: ModelEnding | null;
  startedAt: number | null;
  finished: boolean;
  planted: boolean;
}

export class FirstModel {
  phase: ModelPhase = 'welcome';
  /** The phase each recital was pressed in, by its `startedAt`; one from before the flow has none. */
  private readonly pressedIn = new Map<number, ModelPhase>();
  private clock = 0;
  readonly world: World;

  constructor(before: { readonly startedAt: number | null; readonly finished: boolean }) {
    this.world = { voiceEnded: null, ...before, planted: false };
    this.clock = (before.startedAt ?? 0) + 1;
  }

  /** Whether the screen may show Say it's latest recital as the phase's own. */
  own(): boolean {
    const at = this.world.startedAt;
    return at !== null && this.pressedIn.get(at) === this.phase;
  }

  /** The events the screen can meet now: Begin and Skip only on the welcome, Plant your first verse only on how a verse grows, Next only in hear, Say it only in letters and alone, the rest anywhere. */
  offers(event: WorldEvent): boolean {
    if (event.t === 'begin' || event.t === 'skip') return this.phase === 'welcome';
    if (event.t === 'plant') return this.phase === 'grows';
    if (event.t === 'next') return this.phase === 'hear';
    if (event.t === 'press') return this.phase === 'letters' || this.phase === 'alone';
    return true;
  }

  apply(event: WorldEvent): void {
    const world = this.world;
    switch (event.t) {
      case 'begin':
        this.phase = 'grows';
        break;
      case 'skip':
      case 'plant':
        this.phase = 'hear';
        break;
      case 'next':
        this.phase = 'letters';
        break;
      case 'read':
        world.voiceEnded = null;
        break;
      case 'voiceEnd':
        world.voiceEnded = event.ending;
        break;
      case 'press':
        this.clock += 1 + (this.clock % 3);
        world.startedAt = this.clock;
        world.finished = false;
        this.pressedIn.set(this.clock, this.phase);
        break;
      case 'end':
        world.finished = event.finished;
        break;
      case 'garden':
        world.planted = true;
        break;
    }
    this.settle();
  }

  /** The phases that follow from the world as it stands, until none does. */
  private settle() {
    for (;;) {
      const before = this.phase;
      if (this.phase === 'hear' && this.world.voiceEnded === 'finished') this.phase = 'letters';
      if (this.phase === 'letters' && this.own() && this.world.finished) this.phase = 'alone';
      if (this.phase === 'alone' && this.world.planted) this.phase = 'planted';
      if (this.phase === before) return;
    }
  }
}
