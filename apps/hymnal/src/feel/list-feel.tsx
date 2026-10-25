/* oxlint-disable effect/noAsyncFunction, effect/noGlobals, effect/noNewPromise -- a script at Bun's boundary, as `src/test/phone-list.tsx` is: the list is imported only once the phone's stand-ins are registered (`phone.ts`), it waits on React's frames, and it prints its report on stdout. */

/**
 * Mounts the phones' hymn list (`HymnList.native.tsx`) as an iPhone draws
 * it, by topic, under a Feel whose ports record their calls, then scrolls it
 * past the first topic boundary through its scroll's shared value, as the
 * list's own scroll writes it. Prints, as JSON on its last line, the cues
 * told as it mounted, the cues told by the scroll, and what the ports were
 * told (`feel.slow.test.tsx` reads it).
 */

import { plugin } from 'bun';
import type { ReactNode } from 'react';

import type { Cue } from './cue';
import { phone } from '../test/phone';

phone({ nativeList: true });

// Reanimated's stand-in (`src/test/reanimated.tsx`), as the app's tests have it: a shared value
// set from here tells its derived values and reactions at once, as the UI thread would.
const reanimated = Bun.resolveSync('../test/reanimated.tsx', import.meta.dir);
plugin({
  name: 'feel-list-reanimated',
  setup(build) {
    build.module('react-native-reanimated', () => ({
      contents: `export * from ${JSON.stringify(reanimated)}; export { default } from ${JSON.stringify(reanimated)};`,
      loader: 'js',
    }));
    build.module('react-native-worklets', () => ({
      contents: `export { scheduleOnRN, runOnJS } from ${JSON.stringify(reanimated)};`,
      loader: 'js',
    }));
  },
});

const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const Atom = await import('effect/reactivity/Atom');
const AtomRegistry = await import('effect/reactivity/AtomRegistry');
const { Effect } = await import('effect');
const { RegistryContext } = await import('@effect/atom-react');
const { makeMutable } = await import('react-native-reanimated');
const { hymnHref } = await import('../home/Browse');
const { HymnList } = await import('../reader/HymnList.native');
const { CueProvider, useCue } = await import('./cue');
const { FeelProvider } = await import('./FeelProvider');

/** Forty hymns in two topics: the second topic's row starts past the screen's first rows. */
const hymns = Array.from({ length: 40 }, (_, i) => ({
  number: i + 1,
  title: `Hymn ${i + 1}`,
  firstLine: '',
  topic: `Topic ${Math.floor(i / 20) + 1}`,
  sections: [],
}));

const told: Array<Cue> = [];
const felt: Array<unknown> = [];
const heard: Array<string> = [];
let clock = 0;

/** Records each cue told under it, then hands it on to the Feel above. */
function Spy({ children }: { readonly children: ReactNode }) {
  const tell = useCue();
  return (
    <CueProvider
      value={(cue) => {
        told.push(cue);
        tell(cue);
      }}
    >
      {children}
    </CueProvider>
  );
}

const scroll = makeMutable(0);
const registry = AtomRegistry.make();
const host = document.createElement('div');
document.body.append(host);
const root = createRoot(host);
const frames = () => act(async () => void (await new Promise((done) => setTimeout(done, 50))));

await act(async () => {
  root.render(
    <RegistryContext value={registry}>
      <FeelProvider
        haptics={{ play: (haptic) => void felt.push(haptic) }}
        voice={{ port: { play: (sound) => void heard.push(sound) }, load: Effect.void }}
        clock={() => (clock += 1000)}
      >
        <Spy>
          <HymnList
            hymns={hymns}
            hrefOf={hymnHref}
            offset={Atom.make(0)}
            byTopic
            pullDown={{ node: <></>, height: 0, rest: 0, scroll }}
          />
        </Spy>
      </FeelProvider>
    </RegistryContext>,
  );
});
await frames();
const mounted = [...told];
told.splice(0);

// Past the second topic's row: 20 hymn rows and a topic row are well under 1500 points. The
// stand-in derives the pin as the list draws, so its reaction reads it on the scroll's next frame.
await act(async () => void (scroll.value = 1500));
await act(async () => void (scroll.value = 1501));
await frames();
const scrolled = [...told];

act(() => root.unmount());
process.stdout.write(`\n${JSON.stringify({ mounted, scrolled, felt: felt.length, heard })}\n`);
process.exit(0);
