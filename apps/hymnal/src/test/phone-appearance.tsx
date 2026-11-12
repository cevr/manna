/* oxlint-disable effect/noGlobals, effect/noAsyncFunction, eslint/no-await-in-loop -- a script at Bun's boundary: the screens are imported only once the phone's stand-ins are registered (`phone.ts`), it drives React one step after another and reads the elements the document holds, and it prints its report on stdout. */

/**
 * Mounts, under the root's `SchemeProvider` as the app's layout does, two
 * copies of the phones' hymn list (`HymnList.native.tsx`) with a part
 * drawing every hook role of `color.native.ts`, as an iPhone draws them:
 * one shown, one paused as the stack pauses a screen under another
 * (React's `Activity`, hidden once mounted, its effects cleaned up). Then
 * it changes the scheme while they stay mounted: the appearance setting to
 * Dark, then back to System, then the system itself to dark. After each
 * change it prints the colours each copy draws (`shown`, `paused`) and
 * those a copy mounted afresh under it draws (`fresh`), and first the
 * colours before any change (`before`), as JSON.
 */

import { phone } from './phone';

const { device } = phone();

const { act, Activity, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { View } = await import('react-native');
const Atom = await import('effect/reactivity/Atom');
const { HymnList } = await import('../reader/HymnList.native');
const { applyAppearance, SchemeProvider } = await import('../appearance.native');
const hooks = await import('../color.native');

const hymns = Array.from({ length: 3 }, (_, i) => ({
  number: i + 1,
  title: `Hymn ${i + 1}`,
  firstLine: '',
  topic: 'Topic',
  sections: [],
}));
const offset = Atom.make(0);

/** A part of a screen drawing each hook role as a fill: the accent, the button, the shadow and the rest. */
function Roles() {
  const pressed = hooks.usePressed();
  const roles = {
    accent: hooks.useAccent(),
    button: hooks.useButton(),
    onButton: hooks.useOnButton(),
    selected: hooks.useSelected(),
    onAccent: hooks.useOnAccent(),
    pressed: pressed.fill,
    onPressed: pressed.text,
    shadow: hooks.useShadow(),
  };
  return createElement(
    View,
    {},
    Object.entries(roles).map(([role, fill]) =>
      createElement(View, { key: role, testID: `role-${role}`, style: { backgroundColor: fill } }),
    ),
  );
}

/** A screen: the list and the roles, in a host of their own. */
const screen = (name: string) =>
  createElement(
    View,
    { key: name, testID: `screen-${name}` },
    createElement(HymnList, {
      hymns,
      hrefOf: (n: number) => `/hymns/${n}`,
      offset,
      byTopic: true,
    }),
    createElement(Roles),
  );

/** The colours the screen named `name` draws: the first row's number, and each hook role's fill. */
const coloursOf = (name: string) => {
  const host = document.querySelector(`[data-testid="screen-${name}"]`);
  const number = host?.querySelector<HTMLElement>('[data-testid="row-number"]');
  const roles = [...(host?.querySelectorAll<HTMLElement>('[data-testid^="role-"]') ?? [])];
  return {
    'row-number': number?.style.color ?? 'none',
    ...Object.fromEntries(
      roles.map((role) => [String(role.getAttribute('data-testid')), role.style.backgroundColor]),
    ),
  };
};

/** Mounts `names` under the root's provider, each shown or paused, and answers how to pause one and unmount. */
const mount = async (names: ReadonlyArray<string>) => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const show = async (paused: ReadonlyArray<string>) => {
    await act(async () => {
      root.render(
        createElement(SchemeProvider, {
          children: names.map((name) =>
            createElement(Activity, {
              key: name,
              mode: (paused.includes(name) && 'hidden') || 'visible',
              children: screen(name),
            }),
          ),
        }),
      );
    });
  };
  await show([]);
  return {
    show,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
};

const changes = {
  dark: () => applyAppearance('dark'),
  system: () => applyAppearance('system'),
  'system dark': () => device.set({ scheme: 'dark' }),
};

const screens = await mount(['shown', 'paused']);
const before = coloursOf('shown');
await screens.show(['paused']);
const steps = [];
for (const [name, change] of Object.entries(changes)) {
  await act(async () => change());
  const shown = coloursOf('shown');
  const paused = coloursOf('paused');
  await screens.show([]);
  const back = coloursOf('paused');
  await screens.show(['paused']);
  const fresh = await mount(['fresh']);
  steps.push([name, { shown, paused, back, fresh: coloursOf('fresh') }] as const);
  fresh.unmount();
}
screens.unmount();
process.stdout.write(JSON.stringify({ before, ...Object.fromEntries(steps) }));
process.exit(0);
