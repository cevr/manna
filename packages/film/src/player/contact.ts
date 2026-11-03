const COLS = 6;
const TILE_W = 480;
const GAP = 4;

export const composeContact = async (
  draw: (i: number) => Promise<void>,
  canvas: HTMLCanvasElement,
  frames: ReadonlyArray<number>,
): Promise<HTMLCanvasElement> => {
  const tileH = Math.round((TILE_W * canvas.height) / canvas.width);
  const rows = Math.max(1, Math.ceil(frames.length / COLS));
  const sheet = document.createElement('canvas');
  sheet.width = COLS * TILE_W + (COLS - 1) * GAP;
  sheet.height = rows * tileH + (rows - 1) * GAP;
  const ctx = sheet.getContext('2d');
  if (ctx === null) throw new Error('2d context unavailable');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.imageSmoothingQuality = 'high';
  await frames.reduce(async (before: Promise<void>, i, k) => {
    await before;
    await draw(i);
    const x = (k % COLS) * (TILE_W + GAP);
    const y = Math.floor(k / COLS) * (tileH + GAP);
    ctx.drawImage(canvas, x, y, TILE_W, tileH);
  }, Promise.resolve());
  return sheet;
};
