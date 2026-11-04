import { type SceneSpec, scenesOf } from '@manna/film/canvas';
import { storyDrawing } from '../../../library/storybook/scene.ts';
import { fonts } from '../palette.ts';
import { script } from '../script.ts';
import { SHEET_CELLS } from '../storybook/cells.ts';
import { GRID } from '../storybook/grid.ts';
import { COLD_STORY, MILK_STORY, TITLE_STORY } from '../storybook/stories.ts';

export const scenes: SceneSpec[] = scenesOf(script, {
  drawings: {
    cold: storyDrawing(COLD_STORY, SHEET_CELLS, GRID),
    title: storyDrawing(TITLE_STORY, SHEET_CELLS, GRID),
    milk: storyDrawing(MILK_STORY, SHEET_CELLS, GRID),
  },
  card: { brief: fonts.display, label: fonts.body },
});
