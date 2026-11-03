export const LONG_PRESS_DELAY = 500;
export const LONG_PRESS_MOVE_THRESHOLD = 10;

const owners = new Map<number, symbol>();

const heldAtLift = new Map<number, symbol>();

const letGo = (event: Event) => {
  if ('pointerId' in event && typeof event.pointerId === 'number') {
    const owner = owners.get(event.pointerId);
    owners.delete(event.pointerId);
    if (owner !== undefined) {
      heldAtLift.set(event.pointerId, owner);
    }
  }
};

const pressed = (event: Event) => {
  if ('pointerId' in event && typeof event.pointerId === 'number') {
    heldAtLift.delete(event.pointerId);
  }
};

const heard = new WeakSet<EventTarget>();

function hear(page: EventTarget) {
  if (heard.has(page)) {
    return;
  }
  heard.add(page);
  page.addEventListener('pointerdown', pressed, true);
  page.addEventListener('pointerup', letGo, true);
  page.addEventListener('pointercancel', letGo, true);
}

export function claimPress(pointerId: number, by: symbol, page: EventTarget): boolean {
  hear(page);
  const owner = owners.get(pointerId);
  if (owner === undefined) {
    owners.set(pointerId, by);
    return true;
  }
  return owner === by;
}

export function pressHeldByOther(pointerId: number, by: symbol): boolean {
  const owner = owners.get(pointerId);
  return owner !== undefined && owner !== by;
}

export function liftHeldByOther(pointerId: number, by: symbol): boolean {
  const owner = owners.get(pointerId) ?? heldAtLift.get(pointerId);
  return owner !== undefined && owner !== by;
}
