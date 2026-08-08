const listeners = new Set<(dy: number) => void>();

export function reportTabBarScroll(dy: number): void {
  listeners.forEach((listener) => {
    listener(dy);
  });
}

export function subscribeTabBarScroll(listener: (dy: number) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
