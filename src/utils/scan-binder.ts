// The binder scanned cards go into: the first binder unless "Create & start scanning" on a new
// binder pointed it there (until the app restarts, or that binder is removed or merged).
let target: string | null = null

export const getScanBinder = () => target

export function setScanBinder(binderId: string) {
  target = binderId
}

// A binder is gone: scans go back to the first binder if they were going into it.
export function forgetScanBinder(binderId: string) {
  if (target === binderId) target = null
}
