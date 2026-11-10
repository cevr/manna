/* oxlint-disable effect/noAsyncFunction, effect/noNullish, effect/noTryCatch -- React's act and the motion cases are promise-based; DOM queries and parent walks end at null; promise-based fixture cleanup restores the preload's reduced-motion setting in finally. */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ReducedMotionConfig, ReduceMotion } from 'react-native-reanimated';

/** Sets the system's Reduce Motion before the app mounts, refreshing Reanimated in a separate root; the answer unmounts it and restores the device preference. */
export const setMotion = async (prefers: 'reduce' | 'no-preference') => {
  const device = Reflect.get(window, 'happyDOM').settings.device;
  const before = device.prefersReducedMotion;
  device.prefersReducedMotion = prefers;
  const host = document.createElement('div');
  document.body.append(host);
  const config = createRoot(host);
  await act(async () =>
    config.render(createElement(ReducedMotionConfig, { mode: ReduceMotion.System })),
  );
  return async () => {
    await act(async () => config.unmount());
    host.remove();
    device.prefersReducedMotion = before;
  };
};

/** Runs a case under the given motion preference and restores it even when the case fails. */
export const under = async (prefers: 'reduce' | 'no-preference', body: () => Promise<void>) => {
  const restore = await setMotion(prefers);
  try {
    await body();
  } finally {
    await restore();
  }
};

/** The elements from a drawing up to, but not including, its host. */
const pathTo = (node: Element, top: Element) => {
  const out: HTMLElement[] = [];
  for (let at: Element | null = node; at !== null && at !== top; at = at.parentElement)
    if (at instanceof HTMLElement) out.push(at);
  return out;
};

/** An entering drawing's delay in milliseconds, null at rest, or a missing-drawing marker. */
export const entryOf = (node: Element | null | undefined, top: Element) => {
  if (node === null || node === undefined) return '<no drawing>';
  const entering = pathTo(node, top).find((at) => at.style.animationName !== '');
  if (entering === undefined) return null;
  return Math.round(parseFloat(entering.style.animationDelay || '0') * 1000);
};

/** Whether a drawing or a wrapper below its host carries a sway's rotation. */
export const swayOf = (node: Element | null | undefined, top: Element) =>
  node !== null &&
  node !== undefined &&
  pathTo(node, top).some((at) => /rotate\(/.test(at.style.transform));

/** Every entering, held-unseen or transformed element under the host. */
export const moving = (top: Element) =>
  [...top.querySelectorAll('*')].filter(
    (at) =>
      at instanceof HTMLElement &&
      (at.style.animationName !== '' ||
        at.style.visibility === 'hidden' ||
        at.style.transform !== ''),
  );
