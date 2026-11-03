import { appleAgent, Keys } from './keys.ts';

export const keysLayer = Keys.layerOn(window, appleAgent(navigator.userAgent));
