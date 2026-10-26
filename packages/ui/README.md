# @manna/ui

Base UI's unstyled parts, ported to Solid 2 (the `2.0.0-rc` line of `solid-js` and `@solidjs/web`). No part ships a style: each part shows its state as `data-*` attributes (and, where a value has to reach CSS, as CSS custom properties), and the consumer styles it through those attributes and its own `class`. Each part is imported from its subpath, for example `import { Menu } from '@manna/ui/menu'`; there is no root entry. The package keeps only the parts a page draws: a part upstream has and this list lacks returns with its first consumer, and the attribute names below are the styling contract (no `*DataAttributes` constants are exported). Unit tests run with `bun run test` and the browser tests with `bun run test:browser` (Playwright, `test/browser`), both from `packages/ui`. `UI_BROWSER_CPU_THROTTLE=<rate>` runs each browser test's page that many times slower (Chrome's CPU throttling, `test/browser/harness.ts`), as a loaded runner or a slow phone runs it: run one case with it (`-t`), never the suite.

Every part takes `class` and `style` (a value or a function of the part's state) and `render` (a function of the merged props and the state that replaces the default element). A part's state becomes attributes by one rule unless the part maps it otherwise: `true` becomes a bare `data-<key>` attribute (the key lowercased), another truthy value its string, and a falsy value nothing. Attributes named `data-base-ui-*`, `data-rootownerid`, `data-tabindex`, `data-type="inside"` and `data-type="outside"` (the focus guards) are internal markers, not styling hooks. Every `Portal` takes `inline`: with it its `<div>` renders where it is written instead of at the end of `<body>`, the same in the server's render and the browser's, so a popup open at the first render is in the server's markup (for a `position: fixed` popup under no transform, filter or `contain`); without it, a server render leaves the portal out.

## Parts

### Press

`@manna/ui/press` renders no element and sets no attributes. It holds `claimPress`, `liftHeldByOther` and `LONG_PRESS_MOVE_THRESHOLD`: one owner per press, shared with the context menu's long press. The parts read the text direction as `ltr`; upstream's `DirectionProvider`, `useRender` and the `mergeProps` subpath are left out.

### Menu

`import { Menu } from '@manna/ui/menu'`

- `Menu.Root`: no element; owns the menu's state (`onOpenChange`, `onOpenChangeComplete`). A menu is vertical and modal, wraps its arrow keys, and opens only from its trigger.
  - `Menu.Trigger`: `<button>` that opens the menu on press or with the arrow keys.
  - `Menu.Portal`: `<div>` at the end of `<body>`, rendered while the menu is mounted.
    - `Menu.Positioner`: `<div role="presentation">` that places the popup under the trigger (`sideOffset`, `align`), flipping above it or to the other alignment and shifting to stay in view.
      - `Menu.Popup`: `<div role="menu">`.
        - `Menu.Item`: `<div role="menuitem">` that runs an action and closes the menu (`label` for typeahead).
        - `Menu.Group`: `<div role="group">`.
          - `Menu.GroupLabel`: `<div aria-hidden>` that names the group.
        - `Menu.RadioGroup`: `<div role="group">` of radio items, one checked; its owner holds `value`, and a press on an item offers that item's value to `onValueChange`. A `Menu.GroupLabel` inside it names it.
          - `Menu.RadioItem`: `<div role="menuitemradio">`, `aria-checked` while its `value` is the group's (`label` for typeahead). It is an item as `Menu.Item` is, and keeps the menu open on a press unless `closeOnClick`.
            - `Menu.RadioItemIndicator`: `<span aria-hidden>`, rendered while its item is checked (always with `keepMounted`).
        - `Menu.Separator`: `<div role="separator">` (see Separator).

Upstream's hover opening, submenus, arrow (and `arrowPadding`), backdrop, link and checkbox items, `defaultOpen`, `keepMounted`, `actionsRef` and `highlightItemOnHover` are left out, and so are the options no page passes: the root's `open`, `modal`, `disabled`, `loopFocus`, `orientation` and `onItemHighlighted`; the trigger's and items' `disabled` and `nativeButton`; the plain item's `closeOnClick`; the radio group's `defaultValue` and `disabled`; the indicator's exit transition; the positioner's `side`, `alignOffset`, `anchor`, `positionMethod` and collision options; the popup's `finalFocus`. A part or an option returns with its first consumer.

| Member                            | Attribute                                   | Present when                                                   |
| --------------------------------- | ------------------------------------------- | -------------------------------------------------------------- |
| `Trigger`                         | `data-popup-open`, `data-pressed`           | the menu this trigger opened is open (both together)           |
| `Positioner`                      | `data-open` / `data-closed`                 | the menu is open / closed                                      |
| `Positioner`, `Popup`             | `data-side`                                 | always: `bottom`, or `top` after a collision flip              |
| `Positioner`, `Popup`             | `data-align`                                | always: `start`, `center` or `end`                             |
| `Positioner`                      | `data-anchor-hidden`                        | the anchor has scrolled out of view                            |
| `Positioner`, `Popup`             | `data-instant`                              | transitions are skipped, with the reason: `click` or `dismiss` |
| `Popup`                           | `data-open` / `data-closed`                 | the menu is open / closed                                      |
| `Popup`                           | `data-starting-style` / `data-ending-style` | the enter transition's first frame / the exit transition       |
| `Item`, `RadioItem`               | `data-highlighted`                          | the item is under the keyboard or the pointer                  |
| `RadioItem`, `RadioItemIndicator` | `data-checked` / `data-unchecked`           | the item's value is / is not the group's                       |

`Group`, `GroupLabel` and `RadioGroup` set none; `Separator` sets its own (see Separator).

CSS variables on `Positioner`, set each time it is positioned:

| Variable             | Value                                                                                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--anchor-width`     | the anchor's width (the trigger's, or the context menu's point), snapped to device pixels                                                                                                                                                        |
| `--anchor-height`    | the anchor's height, snapped to device pixels                                                                                                                                                                                                    |
| `--available-width`  | the width the popup has between the anchor and the edge of the viewport (less 5 px of collision padding); `100vw` until first positioned                                                                                                         |
| `--available-height` | the height it has between the anchor and the edge of the viewport (less 5 px); `100vh` until first positioned                                                                                                                                    |
| `--transform-origin` | the point the popup grows from: across, its aligned edge (`0%` for `start`, `100%` for `end`) or, centred or shifted, the anchor's centre; along the side, the anchor's edge (`-4px` under it, `calc(100% + 4px)` over it, for `sideOffset={4}`) |

Upstream's `--positioner-width` and `--positioner-height` belong to its popup auto-resize, which is left out.

### Context menu

`import { ContextMenu } from '@manna/ui/context-menu'`

- `ContextMenu.Root`: no element; a menu opened by a right click or by a touch held still for 500 ms (`LONG_PRESS_DELAY`; moving more than 10 px first cancels it). The lift of the touch that opened it is spent, so it never chooses the item that opened under the finger, and a press a drag has claimed (`@manna/ui/press`) opens nothing.
  - `ContextMenu.Trigger`: `<div>`, the area that opens the menu.
  - `ContextMenu.Portal > ContextMenu.Positioner > ContextMenu.Popup`, and every other member, are the menu's (`Item`, `Group`, `GroupLabel`, `Separator`); the positioner sits at the pointer, start-aligned and nudged so the first item is under it, and takes no `sideOffset` or `align`. The root's `disabled` is left out.

| Member    | Attribute                         | Present when                             |
| --------- | --------------------------------- | ---------------------------------------- |
| `Trigger` | `data-popup-open`, `data-pressed` | the context menu is open (both together) |

The other members set the menu's attributes and CSS variables (see Menu).

### Dialog

`import { Dialog } from '@manna/ui/dialog'`

- `Dialog.Root`: no element; owns the dialog's state. Its owner opens it through `open` (there is no trigger part); on close, focus returns to what had it before.
  - `Dialog.Portal`: `<div>` at the end of `<body>`, rendered while mounted.
    - `Dialog.Backdrop`: `<div role="presentation">`; a press on it closes its own dialog only.
    - `Dialog.Popup`: `<div role="dialog">`.
      - `Dialog.Title`: `<h2>` that labels the popup.
      - `Dialog.Description`: `<p>` that describes the popup.
      - `Dialog.Close`: `<button>` that closes the dialog.

Upstream's trigger, `Dialog.Viewport`, nested dialog stacks (`data-nested`, `data-nested-dialog-open`, `--nested-dialogs`, the backdrop's `forceRender`), `defaultOpen`, the portal's `keepMounted` and `actionsRef`, the `'trap-focus'` modal mode (`modal` is a boolean) and the popup's `initialFocus` and `finalFocus` are left out; a part or an option returns with its first consumer. Dialogs open side by side close one at a time, newest first.

| Member     | Attribute                                   | Present when                                             |
| ---------- | ------------------------------------------- | -------------------------------------------------------- |
| `Backdrop` | `data-open` / `data-closed`                 | the dialog is open / closed                              |
| `Backdrop` | `data-starting-style` / `data-ending-style` | the enter transition's first frame / the exit transition |
| `Popup`    | `data-open` / `data-closed`                 | the dialog is open / closed                              |
| `Popup`    | `data-starting-style` / `data-ending-style` | the enter transition's first frame / the exit transition |

`Close`, `Title` and `Description` set none.

### Toast

`import { Toast } from '@manna/ui/toast'`

- `Toast.Provider`: no element; owns the toasts, added and closed through a `Toast.createToastManager` made outside the tree and listed inside it with `Toast.useToastManager().toasts`.
  - `Toast.Portal`: `<div>` at the end of `<body>`.
    - `Toast.Viewport`: `<div role="region">` the stacked toasts live in.
      - `Toast.Root`: `<div role="dialog">`, one toast, labelled by its title.
        - `Toast.Content`: `<div>` around the toast's content.
          - `Toast.Title`: `<h2>`, rendered only when there is a title.
          - `Toast.Action`: `<button>`, rendered only when it has a label.
          - `Toast.Close`: `<button>` that closes the toast.

A manager has `add` and `close(id)`; an `add` with an existing `id` updates that toast in place and restarts its timer. A toast shows for its `timeout` (5000 ms unless it says, never at 0). Upstream's description, anchored toasts (`Toast.Positioner`, `Toast.Arrow`, `positionerProps`), `update` and `promise` are left out, and so are a toast's `priority` (and the urgent announcement of a high one), its `onClose` and the `loading` type, closing every toast, the provider's `timeout`, and `useToastManager`'s `add` and `close`; a part or option returns with its first consumer.

| Member                     | Attribute                                   | Present when                                                  |
| -------------------------- | ------------------------------------------- | ------------------------------------------------------------- |
| `Viewport`                 | `data-expanded`                             | the stack is expanded (hovered or focused)                    |
| `Root`                     | `data-expanded`                             | the stack is expanded                                         |
| `Root`                     | `data-limited`                              | the toast is past the provider's `limit` (it is also `inert`) |
| `Root`                     | `data-type`                                 | the toast has a `type`: its value                             |
| `Root`                     | `data-swiping`                              | the toast is being swiped                                     |
| `Root`                     | `data-swipe-direction`                      | a swipe has a direction: `up`, `down`, `left` or `right`      |
| `Root`                     | `data-starting-style` / `data-ending-style` | the enter transition's first frame / the exit transition      |
| `Content`                  | `data-expanded`                             | the stack is expanded                                         |
| `Content`                  | `data-behind`                               | the toast is behind the frontmost one                         |
| `Title`, `Action`, `Close` | `data-type`                                 | the toast has a `type`: its value                             |

CSS variables on `Toast.Root`: `--toast-swipe-movement-x`, `--toast-swipe-movement-y` (the swipe so far). Upstream's stack variables (`--toast-index`, `--toast-offset-y`, `--toast-height` and the viewport's `--toast-frontmost-height`) and the height measurement behind them are left out: the receipts are a flat column. `Toast.Close` is always exposed to assistive technology (upstream hides it while the stack is collapsed).

### Toggle

`import { Toggle } from '@manna/ui/toggle'`

- `Toggle`: `<button aria-pressed>`, a two-state button, pressed while its `value` is among its `ToggleGroup`'s; it joins the group's roving focus. It renders only inside a group.

Upstream's lone toggle (`pressed`, `defaultPressed`, `onPressedChange`) and `disabled` are left out; an option returns with its first consumer.

| Member   | Attribute      | Present when          |
| -------- | -------------- | --------------------- |
| `Toggle` | `data-pressed` | the toggle is pressed |

### Toggle group

`import { ToggleGroup } from '@manna/ui/toggle-group'`

- `ToggleGroup`: `<div role="group">`, one of its `Toggle`s pressed at a time. Its owner holds `value`; a press offers `onValueChange` the pressed toggle's value alone, or `[]` for the one already pressed. The left and right arrows (wrapping at the ends), Home and End move its one tab stop, which starts on the toggle drawn pressed (`aria-pressed`; the first when none is pressed). The server's markup has that tab stop too, on the toggle whose value is `value`'s first (the first toggle when `value` is empty), and the browser keeps it there; a `value` naming no toggle gives none until the browser has mounted the group, which then puts it on the first. Upstream's server markup has no tab stop. A value changed from outside the group later (Back, a key) leaves the tab stop where it was.
  - A mouse press from outside the group takes no focus. Focus goes where the platform sends it for a press on content that takes none: to the group's nearest focusable ancestor (a dialog's popup, so Tab and the keys stay in it), else off every control (`body`, so the page keeps its keys: Space, the arrows). Either way a field that had focus commits on its own blur, before the press's `onValueChange`, and the pressed toggle takes the tab stop. When focus is already in the group, the press moves it to the pressed toggle. Upstream focuses the toggle on every press.
  - `Toggle`: see Toggle.

Upstream's uncontrolled mode (`defaultValue`), `multiple`, `disabled`, `orientation` and `loopFocus` are left out; an option returns with its first consumer. The group carries no attributes.

### Separator

`Menu.Separator`, `ContextMenu.Separator` (no subpath of its own)

- `Separator`: `<div role="separator">` between groups of items, `aria-orientation` saying its `orientation` (`horizontal`, the default, or `vertical`).

| Member      | Attribute          | Present when                       |
| ----------- | ------------------ | ---------------------------------- |
| `Separator` | `data-orientation` | always: `horizontal` or `vertical` |

## Composing behaviour

`import { listen, mix, type Mixin } from '@manna/ui/mix'`

Solid 2 has no `mix` prop (Remix 3's `mix={[...]}`), so a behaviour comes in two halves:

- A **prop mixin** (`Mixin<T>`) is a props bag for an element of type `T`, with getters for its live values: its `role`, ARIA, `tabindex`, `data-*` state, `class` and `style`, and its `onX` handlers. Spread onto an element or a part, its attributes are in the server's markup, and its handlers are delegated and merged with the others. `T` types the attributes (a `Mixin<HTMLButtonElement>` takes `type`) and the handlers' `currentTarget`; a `data-*` key is allowed in an object literal.
- A **ref factory** does the work only the DOM can do: listener options, listeners on the document or the window, observers, focus, measuring. `onElement(setup)` runs `setup` on the element once the render has settled (connected, its attributes set) and runs what `setup` returns when the owner is disposed. `listen(target, type, handler, options)` adds a native listener on the element, its `document` or its `window` (`'element' | 'document' | 'window'`) while the owner lives. A prop mixin may carry ref factories under `ref`.

`mix(...mixins)` merges mixins left to right by `mergeProps`'s rules and leaves out a falsy entry, so `cond && mixin()` composes. The parts' button behaviour (`src/internals/useButton.ts`) is a mixin built this way; the scrub area's, the toast's and the context menu trigger's native listeners are `listen`, and `listen` is built on `onElement` (`src/mix/element.ts`, the package's own: no subpath exports it).

| Rule                                                                                                                                                                                     | Reason                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Build a mixin in the component's body and spread the result. Never write `{...mix(a(), b())}` in JSX.                                                                                    | The compiler wraps a call in a spread in a computation that runs again whenever a getter it read changes; each run builds the mixins again, and their signals start over.                                                                                                                        |
| Make a ref factory in the component's body, under its element's owner (inside a `<Show>` around the element, not above it). Inline in `ref={[...]}` only on an element without a spread. | It registers its work with `onSettled`, which runs once: made before its element exists, it finds none. The server never evaluates the `ref` of an element with a spread (solidjs/solid#4081), so a factory made there is made only in the browser, and the hydration ids of what follows shift. |
| Keep a ref factory's DOM work in `onElement`'s setup; the callback Solid calls only keeps the element.                                                                                   | Solid calls a ref callback before the element is connected and before its dynamic attributes (`title={x()}`) are set (solidjs/solid#4080), and never on the server.                                                                                                                              |
| Put the mixins first and the caller's props last.                                                                                                                                        | The rightmost attribute wins. Handlers run rightmost first (as Base UI's), so the caller's run before a mixin's, and `event.preventBaseUIHandler()` stops the ones to its left. Every `class` is kept, `style` objects merge, and every ref is called.                                           |
| Expect a `listen` listener to run before every `onX` handler, a child's too.                                                                                                             | Solid delegates `onX` to the document; a native listener on the element runs first (solidjs/solid#4083), and its `stopPropagation()` keeps the event from them.                                                                                                                                  |

```tsx
function pressable(onPress: () => void): Mixin<HTMLDivElement> {
  const [pressed, setPressed] = createSignal(false);
  return {
    role: 'button',
    tabindex: 0,
    get 'data-pressed'() {
      return pressed() ? '' : undefined;
    },
    onPointerDown: () => setPressed(true),
    onClick: () => onPress(),
    // A press ends wherever the pointer lifts.
    ref: listen('document', 'pointerup', () => setPressed(false)),
  };
}

function Card(props: { onOpen: () => void; class?: string }) {
  const behaviour = mix<HTMLDivElement>(
    pressable(() => props.onOpen()),
    {
      get class() {
        return props.class;
      },
    },
  );
  return <div {...behaviour} />;
}
```

## Styling contract

The lab styles these parts through its tokens (`packages/film/src/player/tokens.css`), in rules that select on the `data-*` attributes above and on its own class names. The menus, dialogs and toasts are styled in `packages/film/src/lab/command/style.ts`; the toggle group (`.sh-seg`, its toggles' `data-pressed`) in `packages/film/src/lab/page-shell-style.ts`. No part writes a colour, a size or a font family; the only inline styles a part sets are mechanics (position, `pointer-events`, `user-select`, `touch-action`, a transition turned off for a frame or during a drag, an opacity held at 0 until the first position, `will-change: transform` at a device pixel ratio of 1.5 or more; the sheet's overlay, scroll container, stage and snap markers, their snapping and scroll-driven motion) and the CSS variables listed above. A part that needs a visual state exposes it as a `data-*` attribute rather than styling it.
