import { LIGHT } from '../../../righteousness-by-faith/light.ts';
import type { Look } from '../../look.ts';
import { court } from './court.ts';
import { card, job } from './job.ts';

export const cutpaper: Look = { court, job, card, light: LIGHT.room };
