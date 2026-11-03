import { appleAgent, Keys } from './keys.ts';

/** The key presses on this page. */
export const keysLayer = Keys.layerOn(window, appleAgent(navigator.userAgent));
