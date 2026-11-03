/**
 * The ids pass's encoding, shared by the page that writes it and the
 * measures that read it: red is the part id × 12; green is the pixel's view
 * depth in levels of 1/64 head from 8 heads, so the camera's 10 heads off
 * sit mid-range.
 */
export const IDS_PASS = { idStep: 12, depthFrom: 8, depthLevels: 64 } as const;
