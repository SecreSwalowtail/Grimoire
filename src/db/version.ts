// A counter that goes up whenever what the Binder shows changes: binders created, copies added,
// edited or removed, or an owned card's price refreshed. The Binder reloads only when it moved since its last load,
// instead of on every visit (2,000 cards took ~200 ms to reload on a phone).

let version = 0;

export const collectionVersion = () => version;

export function collectionChanged() {
  version += 1;
}
