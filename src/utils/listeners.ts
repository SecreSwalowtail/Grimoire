// Change listeners for a store kept in a module, in the shape useSyncExternalStore takes:
// `useSyncExternalStore(changes.subscribe, getValue)`, and `changes.notify()` after each change.
export function createListeners() {
  const listeners = new Set<() => void>()
  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    notify() {
      listeners.forEach((listener) => listener())
    },
  }
}
