// What a page has selected: one thing of the film's or the review's, as a
// tagged union every primitive reads (the context menu shows its commands,
// the inspector its fields, ⌘K and the keys act on it). The ask page keeps
// no selection in its URL: a link to a selection is the page's own, or a
// file's (`citeOf`). A multi-select is a list of the same union; only its
// first item is citable (a batch is an action, not a place). Pure.

import { Schema } from 'effect';
import { ActName } from '../core/address-schema.ts';
import { reviewFileUrl } from '../core/api.ts';

/** One selected thing. */
export const Selection = Schema.TaggedUnion({
  /** A film as a whole (its project's header, its card on the index). */
  Film: { film: Schema.String },
  /** An act of a film's project. */
  Act: { film: Schema.String, act: ActName },
  /** A scene of a film. */
  Scene: { film: Schema.String, scene: Schema.String },
  /**
   * Words `from`–`to` of a scene's line: a talk's section's take word
   * indices, a narrated beat's words as its line is said (`?words=`).
   */
  Words: { scene: Schema.String, from: Schema.Finite, to: Schema.Finite },
  /** A mark of a beat's line (`{name}` in its `say`), by its name, on the Script (`?mark=`). */
  Mark: { scene: Schema.String, name: Schema.String },
  /** A note of the lab's feed, by its id. */
  Note: { id: Schema.String },
  /** A folder of renders (its card on the index). */
  Folder: { folder: Schema.String },
  /** A comparison set of a folder of renders. */
  Set: { folder: Schema.String, point: Schema.String },
  /** One version of a comparison set. */
  Version: { folder: Schema.String, point: Schema.String, version: Schema.String },
  /** A file of a folder of renders in no set (a loose video), by its ref. */
  File: { ref: Schema.String },
  /** A choice point of a film (a scene's render on the project, a score, a look). */
  Point: { film: Schema.String, point: Schema.String },
  /** A variant of a film's choice point. */
  Variant: { film: Schema.String, point: Schema.String, variant: Schema.String },
  /** A beat of the studio's script. */
  Beat: { beat: Schema.String },
  /** A Board panel on the studio's timeline (`<beat>.<mark>`). */
  Panel: { panel: Schema.String },
});
export type Selection = typeof Selection.Type;

/** A selection's kind: its tag. */
export type SelectionTag = Selection['_tag'];

/** A talk's words selected, as `?words=` holds them. */
export type WordsSelection = typeof Selection.cases.Words.Type;

/**
 * The link that cites `selection` from the page at `href`: a file as itself
 * (its link opens the file); anything else as the page it is on, which keeps
 * no selection in its URL.
 */
export const citeOf = (selection: Selection, href: string): string => {
  if (selection._tag === 'File') return reviewFileUrl(selection.ref);
  return href;
};

/** A selection as a person reads it: `beat cold`, `option b of cold`. */
export const selectionText = (selection: Selection): string =>
  Selection.match(selection, {
    Film: (s) => `film ${s.film}`,
    Act: (s) => `act ${s.act}`,
    Scene: (s) => `scene ${s.scene}`,
    Words: (s) => {
      if (s.from === s.to) return `word ${s.from} of ${s.scene}`;
      return `words ${s.from}–${s.to} of ${s.scene}`;
    },
    Mark: (s) => `mark ${s.name} in ${s.scene}`,
    Note: (s) => `note ${s.id}`,
    Panel: (s) => `panel ${s.panel}`,
    Folder: (s) => `folder ${s.folder}`,
    Set: (s) => `set ${s.point}`,
    Version: (s) => `option ${s.version} of ${s.point}`,
    File: (s) => `file ${s.ref}`,
    Point: (s) => s.point,
    Variant: (s) => `${s.variant} of ${s.point}`,
    Beat: (s) => `beat ${s.beat}`,
  });
