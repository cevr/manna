import type { StoryFilm } from '../../../library/storybook/scene.ts';
import { scenes } from '../scenes/index.ts';
import { GRID } from './grid.ts';
import { SHEETS } from './sheets.ts';
import { STORIES } from './stories.ts';

/** In Its Order as the storybook draws it: its scenes as the film lays them, its storybook scenes, its take's timings and its declared sheets. */
export const inItsOrder: StoryFilm = {
  film: 'in-its-order',
  grid: GRID,
  scenes,
  stories: STORIES,
  timings: `${import.meta.dir}/../narration/timings.json`,
  sheets: SHEETS,
};
