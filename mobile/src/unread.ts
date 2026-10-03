/**
 * Tiny module-level unread-count store so the tab badge can be fed from
 * any screen that loads notifications, without prop drilling or a reducer.
 */
type Listener = () => void;

let count = 0;
const listeners = new Set<Listener>();

export function setUnread(n: number): void {
  if (n === count) return;
  count = n;
  listeners.forEach((l) => l());
}

export function getUnread(): number {
  return count;
}

export function subscribeUnread(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}