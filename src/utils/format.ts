// "€1,284.60"
export function formatEur(value: number) {
  return `€${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// Scryfall serves the same image at several sizes; only the size segment of the URL differs.
// "art_crop" is just the artwork, used for the Binder tiles.
export function artCropUri(imageUri: string | null) {
  return imageUri?.replace('/normal/', '/art_crop/') ?? null
}
