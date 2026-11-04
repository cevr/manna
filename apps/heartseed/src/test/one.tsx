/**
 * `one` as the app's tests see it: a phone's safe area with no insets, its
 * haptics (felt by nothing), and its device info (a phone, not the
 * simulator). `setup.ts` stands this module in for `one`, the router's
 * boundary, with the parts the screens use.
 */
export const useSafeAreaInsets = () => ({ top: 0, right: 0, bottom: 0, left: 0 });

export const One = {
  Haptics: { impact: () => {}, selection: () => {}, notification: () => {} },
  // oxlint-disable-next-line effect/noNewPromise -- One's `Device.getInfo` answers a promise, and the stand-in answers as it does.
  Device: { getInfo: () => Promise.resolve({ isSimulator: false }) },
};
