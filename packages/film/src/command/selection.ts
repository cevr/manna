import { Schema } from 'effect';
import { ActName } from '../core/address-schema.ts';
import { reviewFileUrl } from '../core/api.ts';

export const Selection = Schema.TaggedUnion({
  Film: { film: Schema.String },
  Act: { film: Schema.String, act: ActName },
  Scene: { film: Schema.String, scene: Schema.String },
  Words: { scene: Schema.String, from: Schema.Finite, to: Schema.Finite },
  Mark: { scene: Schema.String, name: Schema.String },
  Note: { id: Schema.String },
  Folder: { folder: Schema.String },
  Set: { folder: Schema.String, point: Schema.String },
  Version: { folder: Schema.String, point: Schema.String, version: Schema.String },
  File: { ref: Schema.String },
  Point: { film: Schema.String, point: Schema.String },
  Variant: { film: Schema.String, point: Schema.String, variant: Schema.String },
  Beat: { beat: Schema.String },
  Panel: { panel: Schema.String },
});
export type Selection = typeof Selection.Type;

export type SelectionTag = Selection['_tag'];

export type WordsSelection = typeof Selection.cases.Words.Type;

export const citeOf = (selection: Selection, href: string): string => {
  if (selection._tag === 'File') return reviewFileUrl(selection.ref);
  return href;
};

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
