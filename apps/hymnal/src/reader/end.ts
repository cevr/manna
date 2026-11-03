export const END_ROOM = 32;

export const endSpace = (bottom: number) => Math.max(0, bottom) + END_ROOM;

export const listEndSpace = (stackBottom: number, findRoom: number) =>
  endSpace(Math.max(stackBottom, findRoom));
