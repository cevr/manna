/* oxlint-disable effect/noGlobals, effect/noAsyncFunction, eslint/no-await-in-loop -- a script at Bun's boundary: the screens are imported only once the phone's stand-ins are registered (`phone.ts`), it drives React one step after another and reads the elements the document holds, and it prints its report on stdout. */

/**
 * Mounts the phones' hymn list (`HymnList.native.tsx`) and a screen part
 * drawing every hook role of `color.native.ts`, as an iPhone draws them,
 * then changes the scheme while they stay mounted: the appearance setting
 * to Dark, then back to System, then the system itself to dark. After each
 * change it prints the colours the mounted screens draw (`live`) and those
 * a pair mounted afresh under it draws (`fresh`), and first the colours
 * before any change (`before`), as JSON.
 */

import { phone } from './phone';

const { device } = phone();

const { act, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { View } = await import('react-native');
const Atom = await import('effect/reactivity/Atom');
const { HymnList } = await import('../reader/HymnList.native');
const { applyAppearance } = await import('../appearance.native');
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

/** The colours the screens in `host` draw: the first row's number, and each hook role's fill. */
const coloursOf = (host: HTMLElement) => {
  const number = host.querySelector<HTMLElement>('[data-testid="row-number"]');
  const roles = [...host.querySelectorAll<HTMLElement>('[data-testid^="role-"]')];
  return {
    'row-number': number?.style.color ?? 'none',
    ...Object.fromEntries(
      roles.map((role) => [String(role.getAttribute('data-testid')), role.style.backgroundColor]),
    ),
  };
};

const mount = async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render([
      createElement(HymnList, {
        key: 'list',
        hymns,
        hrefOf: (n: number) => `/hymns/${n}`,
        offset,
        byTopic: true,
      }),
      createElement(Roles, { key: 'roles' }),
    ]);
  });
  return {
    host,
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

const screens = await mount();
const before = coloursOf(screens.host);
const steps = [];
for (const [name, change] of Object.entries(changes)) {
  await act(async () => change());
  const live = coloursOf(screens.host);
  const fresh = await mount();
  steps.push([name, { live, fresh: coloursOf(fresh.host) }] as const);
  fresh.unmount();
}
screens.unmount();
process.stdout.write(JSON.stringify({ before, ...Object.fromEntries(steps) }));
process.exit(0);
