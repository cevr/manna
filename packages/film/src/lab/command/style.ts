// The look of the pages' command surfaces (⌘K, the `?` sheet, the context
// menu, the receipts' toasts, and every primitive after them). The rules
// read the studio's tokens (`player/tokens.css`, design language §3 and §5:
// menus and toasts on `--surface-2` with `--line-strong` and `--shadow-pop`,
// rows `--row-h`, keys in the Kbd part's look, the accent only for a
// selection or the one verb): no colour, face, size, radius or spacing is
// written in a rule or a component, so restyling the surfaces is changing
// the tokens. Only what no studio token holds is named here
// (`COMMAND_TOKENS`): the paddings and heights the surfaces compose, and
// their own geometry (widths, heights, the layer). Put in the page by its
// page (`ASK_PAGE`). Each surface fits a phone: no wider than the screen
// less its gutters, scrolling inside itself. A field is the kit's
// (`.sh-field`), styled where the kit is, never here. A phone's width is the
// studio's one breakpoint (`PHONE`), asked through its owner. On a phone the
// receipts stand on what `--cmd-sheet-floor` says (the shell's floor,
// `--shell-floor`: the safe area; and the shell's dock docked on it).

import { PHONE } from '../viewport.ts';

/**
 * The command surfaces' own constants: the four paddings and heights they
 * compose from studio tokens, and the geometry no studio token holds.
 */
const COMMAND_TOKENS = `
body {
  --cmd-row-pad: var(--s-2) var(--s-3);
  --cmd-key-pad: 0 var(--s-1);
  --cmd-button-pad: 0 var(--s-2);
  --cmd-row-height: max(var(--row-h), var(--hit));
  --cmd-width: 560px;
  --cmd-menu-width: 200px;
  --cmd-count-size: 18px;
  --cmd-toast-width: 420px;
  --cmd-height: 72vh;
  --cmd-top: 12vh;
  --cmd-layer: 40;
  --cmd-sheet-floor: var(--shell-floor);
}
`;

const COMMAND_RULES = `
.lab-sheet-backdrop { position: fixed; inset: 0; background: var(--backdrop); z-index: var(--cmd-layer); }
.lab-command-menu, .lab-keys-sheet {
  position: fixed; z-index: calc(var(--cmd-layer) + 1); left: 50%; top: var(--cmd-top); transform: translateX(-50%);
  width: min(var(--cmd-width), calc(100vw - 2 * var(--gutter))); max-height: var(--cmd-height); overflow: auto;
  background: var(--surface-2); color: var(--text-1); border: 1px solid var(--line-strong);
  border-radius: var(--r-2); padding: var(--s-3); box-shadow: var(--shadow-pop);
  font-family: var(--font); font-size: var(--body-fs); line-height: var(--body-lh);
}
.lab-sheet-title {
  margin: 0 0 var(--s-1); font-size: var(--fs-2); font-weight: var(--w-3); color: var(--text-2);
  text-transform: uppercase; letter-spacing: var(--track-caps);
}
.lab-sheet-subject {
  font-size: var(--fs-3); font-weight: var(--w-2); color: var(--text-1);
  text-transform: none; letter-spacing: normal;
}
.lab-sheet-about { margin: 0 0 var(--s-2); color: var(--text-2); }
.lab-command-query {
  width: 100%; font: inherit; font-size: var(--fs-5); padding: var(--cmd-row-pad);
  border-radius: var(--r-2); background: transparent; color: var(--text-1);
  border: 1px solid var(--line-strong); margin-bottom: var(--s-1);
}
.lab-command-rows { display: flex; flex-direction: column; }
.lab-command-row {
  display: grid; grid-template-columns: 1fr auto auto; gap: var(--s-2); align-items: baseline;
  padding: var(--cmd-row-pad); border-radius: var(--r-2); cursor: pointer; min-height: var(--cmd-row-height);
}
.lab-command-row[aria-selected="true"] { background: var(--surface-3); }
.lab-command-group, .lab-command-none, .lab-keys-touch, .lab-keys-none { color: var(--text-2); font-size: var(--fs-2); }
.lab-command-menu kbd, .lab-keys-sheet kbd {
  font-family: var(--font); font-size: var(--fs-2); color: var(--text-1); padding: var(--cmd-key-pad);
  border: 1px solid var(--line-strong); border-radius: var(--r-1);
}
.lab-command-row kbd:empty { display: none; }
.lab-keys-group h3 {
  font-size: var(--fs-2); margin: var(--s-3) 0 var(--s-1); color: var(--text-2); font-weight: var(--w-3);
  text-transform: uppercase; letter-spacing: var(--track-caps);
}
.lab-keys-row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0 var(--s-2); align-items: center;
  padding: var(--s-1) 0; border-top: 1px solid var(--line-strong);
}
.lab-keys-touch { grid-column: 1; }
.lab-context-positioner { z-index: calc(var(--cmd-layer) + 1); }
.lab-context-menu {
  min-width: var(--cmd-menu-width); max-width: calc(100vw - 2 * var(--gutter)); max-height: var(--cmd-height); overflow: auto;
  background: var(--surface-2); color: var(--text-1); border: 1px solid var(--line-strong);
  border-radius: var(--r-2); padding: var(--s-1); box-shadow: var(--shadow-pop);
  font-family: var(--font); font-size: var(--body-fs); line-height: var(--body-lh);
}
.lab-context-label { padding: var(--s-1) var(--s-2) 0; color: var(--text-2); font-size: var(--fs-2); }
.lab-context-separator { height: 1px; margin: var(--s-1) 0; background: var(--line-strong); }
.lab-context-item {
  display: flex; justify-content: space-between; align-items: center; gap: var(--s-2);
  padding: var(--cmd-row-pad); border-radius: var(--r-2); cursor: pointer; min-height: var(--cmd-row-height);
}
.lab-context-item[data-highlighted] { background: var(--surface-3); }
.lab-context-menu kbd {
  font-family: var(--font); font-size: var(--fs-2); color: var(--text-2); padding: var(--cmd-key-pad);
  border: 1px solid var(--line-strong); border-radius: var(--r-1);
}
.lab-context-menu kbd:empty { display: none; }
/* A radio item's check (the film switcher's open film): a glyph in the key's ink, no key's box. */
.lab-context-check { font-size: var(--fs-2); color: var(--text-2); }
.lab-inspect {
  font: inherit; color: inherit; background: none; border: 0; padding: 0; margin: 0; cursor: pointer; text-align: inherit;
}
/*
 * A name reads as text, yet is a target of the pointer's size (\`--hit\`: a
 * finger's on the phone, the laptop's dense one): a hit-slop past it each
 * way, the row laid out as before. A comment count's dot sits in a box that
 * size, in the row's flow, held on the name's line, so a name and its count
 * never share a hit area: a short name with a count beside it is that wide
 * too. With no count, the hit-slop alone is its target, and it is as wide as
 * its words.
 */
.lab-named { display: inline-flex; align-items: center; gap: var(--s-1); min-width: 0; max-width: 100%; vertical-align: middle; }
.lab-named:has(> .lab-count-hit) > .lab-inspect { min-width: var(--hit); }
.lab-inspect { position: relative; }
.lab-inspect::before {
  content: ''; position: absolute;
  left: calc(50% - max(50%, var(--hit) / 2)); top: calc(50% - max(50%, var(--hit) / 2));
  width: max(100%, var(--hit)); height: max(100%, var(--hit));
}
.lab-count-hit {
  display: inline-grid; place-items: center; flex: none; min-width: var(--hit); min-height: var(--hit);
  padding: 0; margin: 0; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; vertical-align: middle;
}
.lab-count {
  min-width: var(--cmd-count-size); height: var(--cmd-count-size); padding: 0 var(--s-1);
  border: 1px solid var(--line-strong); border-radius: var(--r-1); background: none; color: var(--text-1);
  line-height: var(--cmd-count-size);
}
@media ${PHONE} {
  body:has(.sh-dock) { --cmd-sheet-floor: calc(var(--shell-floor) + var(--dock-h)); }
}
.lab-clamp { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/*
 * The receipts (design language §5) cover no control. On a phone they are
 * first in the bottom stack: over the dock. Elsewhere, at the foot, centred.
 */
.lab-receipts {
  position: fixed; z-index: calc(var(--cmd-layer) + 2); left: 50%; bottom: var(--gutter); transform: translateX(-50%);
  width: min(var(--cmd-toast-width), calc(100vw - 2 * var(--gutter)));
  display: flex; flex-direction: column; gap: var(--s-1);
}
@media ${PHONE} {
  .lab-receipts { bottom: calc(var(--cmd-sheet-floor) + var(--s-2)); }
}
.lab-receipt {
  background: var(--surface-2); color: var(--text-1); border: 1px solid var(--line-strong);
  border-radius: var(--r-2); padding: var(--cmd-row-pad); box-shadow: var(--shadow-pop);
  font-family: var(--font); font-size: var(--body-fs); line-height: var(--body-lh);
  transform: translate(var(--toast-swipe-movement-x, 0px), var(--toast-swipe-movement-y, 0px));
}
.lab-receipt[data-limited] { display: none; }
.lab-receipt[data-type="refused"] { border-left: 2px solid var(--state-findings); }
.lab-receipt[data-type="refused"] .lab-receipt-said { color: var(--state-findings); }
.lab-receipt[data-type="busy"] .lab-receipt-said { color: var(--text-2); }
.lab-receipt-content { display: flex; align-items: center; gap: var(--s-2); }
.lab-receipt-said { flex: 1; min-width: 0; margin: 0; font-size: var(--body-fs); font-weight: var(--w-1); overflow-wrap: anywhere; }
.lab-receipt-undo, .lab-receipt-close {
  font: inherit; font-size: var(--fs-2); cursor: pointer; background: none; color: var(--text-1);
  border-radius: var(--r-2); padding: var(--cmd-button-pad); min-height: var(--hit); min-width: var(--hit);
}
.lab-receipt-undo { border: 1px solid var(--line-strong); color: var(--text-1); }
.lab-receipt-close { border: 0; color: var(--text-2); }
`;

/** The command surfaces' stylesheet: the tokens, then the rules that read them. */
export const COMMAND_CSS = `${COMMAND_TOKENS}${COMMAND_RULES}`;
