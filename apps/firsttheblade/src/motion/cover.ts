export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Position {
  readonly x: number;
  readonly y: number;
}

const CENTRE: Position = { x: 0.5, y: 0.5 };

export const positionOf = (computed: string): Position => {
  const found = /^\s*(-?[\d.]+)%\s+(-?[\d.]+)%\s*$/.exec(computed);
  if (!found) return CENTRE;
  return { x: Number(found[1]) / 100, y: Number(found[2]) / 100 };
};

export const coverMap = (box: Size, picture: Size, position: Position) => {
  const scale = Math.max(box.width / picture.width, box.height / picture.height);
  const drawn = { width: picture.width * scale, height: picture.height * scale };
  const left = (box.width - drawn.width) * position.x;
  const top = (box.height - drawn.height) * position.y;
  return [
    box.width / drawn.width,
    box.height / drawn.height,
    -left / drawn.width,
    -top / drawn.height,
  ] as const;
};
