import emblemLand from '../art/emblem-land.svg';
import emblemPath from '../art/emblem-path.svg';
import emblemRemedies from '../art/emblem-remedies.svg';
import emblemTaught from '../art/emblem-taught.svg';
import drawnLand from '../art/emblem-land.svg?raw';
import drawnPath from '../art/emblem-path.svg?raw';
import drawnRemedies from '../art/emblem-remedies.svg?raw';
import drawnTaught from '../art/emblem-taught.svg?raw';
import field768 from '../art/field-768.webp';
import field1536 from '../art/field-1536.webp';
import field3072 from '../art/field-3072.webp';
import night768 from '../art/night-768.webp';
import night1536 from '../art/night-1536.webp';
import type { SeriesId } from '../content.ts';
import { withLeaf } from './emblems.ts';

export interface Painting {
  readonly src: string;
  readonly srcset: string;
}

type Width = readonly [url: string, width: number];

const painting = (smallest: Width, ...larger: ReadonlyArray<Width>): Painting => ({
  src: smallest[0],
  srcset: [smallest, ...larger].map(([url, width]) => `${url} ${width}w`).join(', '),
});

export const FIELD = painting([field768, 768], [field1536, 1536], [field3072, 3072]);

export const NIGHT = painting([night768, 768], [night1536, 1536]);

export const EMBLEMS: Record<SeriesId, string> = {
  path: emblemPath,
  land: emblemLand,
  taught: emblemTaught,
  remedies: emblemRemedies,
};

export const EMBLEM_DRAWINGS: Record<SeriesId, string> = {
  path: drawnPath,
  land: drawnLand,
  taught: withLeaf(drawnTaught),
  remedies: drawnRemedies,
};
