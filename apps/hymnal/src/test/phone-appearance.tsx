/* oxlint-disable effect/noGlobals, effect/noAsyncFunction, eslint/no-await-in-loop -- a script at Bun's boundary: the colour module is imported only once the phone's stand-ins are registered (`phone.ts`), it drives React one step after another and reads the elements the document holds, and it prints its report on stdout. */

/**
 * Mounts, under the root's `SchemeProvider` as the app's layout does, two
 * screens drawing every hook role of `color.native.ts` as an iPhone draws
 * them: one shown, one paused as the stack pauses a screen under another
 * (React's `Activity`, hidden once mounted, its effects cleaned up). Then
 * it changes the scheme while they stay mounted: the appearance setting to
 * Dark, then back to System, then the system itself to dark. After each
 * change it prints the colours each screen draws (`shown`, `paused`), the
 * paused one's once shown again (`back`), and those a screen mounted
 * afresh under it draws (`fresh`), and first the colours before any change
 * (`before`), as JSON. The phones' list's rows are held the same way by
 * `src/test/phone-list.tsx` (`setting`), a slow test's script.
 */

import { phone } from './phone';

const { device } = phone();

const { act, Activity, createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { View } = await import('react-native');
const { applyAppearance, SchemeProvider } = await import('../appearance.native');
const hooks = await import('../color.native');

/** A screen drawing each hook role as a fill: the accent, the button, the shadow and the rest. */
function Roles({ name }: { readonly name: string }) {
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
    { testID: `screen-${name}` },
    Object.entries(roles).map(([role, fill]) =>
      createElement(View, { key: role, testID: `role-${role}`, style: { backgroundColor: fill } }),
    ),
  );
}

/** The fills the screen named `name` draws, by role. */
const coloursOf = (name: string) =>
  Object.fromEntries(
    [
      ...(document
        .querySelector(`[data-testid="screen-${name}"]`)
        ?.querySelectorAll<HTMLElement>('[data-testid^="role-"]') ?? []),
    ].map((role) => [String(role.getAttribute('data-testid')), role.style.backgroundColor]),
  );

/** Mounts `names` under the root's provider, each shown, and answers how to pause some and unmount. */
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
              children: createElement(Roles, { name }),
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
