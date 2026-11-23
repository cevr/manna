/** Every row of the inventory, by app, in the inventory's order. */
import type { AppName, Row } from '../src/model.ts';
import { rows as hsAbout } from './heartseed/about.ts';
import { rows as hsAdd } from './heartseed/add.ts';
import { rows as hsFirst } from './heartseed/first.ts';
import { rows as hsHome } from './heartseed/home.ts';
import { rows as hsRead } from './heartseed/read.ts';
import { rows as hsSettings } from './heartseed/settings.ts';
import { rows as hsToday } from './heartseed/today.ts';
import { rows as hyAbout } from './hymnal/about.ts';
import { rows as hyFind } from './hymnal/find.ts';
import { rows as hyHome } from './hymnal/home.ts';
import { rows as hyHymn } from './hymnal/hymn.ts';
import { rows as hyPlayer } from './hymnal/player.ts';
import { rows as hySettings } from './hymnal/settings.ts';

export const ROWS: Readonly<Record<AppName, ReadonlyArray<Row>>> = {
  heartseed: [...hsFirst, ...hsHome, ...hsToday, ...hsSettings, ...hsAbout, ...hsAdd, ...hsRead],
  hymnal: [...hyHome, ...hyFind, ...hyHymn, ...hyPlayer, ...hySettings, ...hyAbout],
};
