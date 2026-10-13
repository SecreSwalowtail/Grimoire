// "€1,284.60"
export function formatEur(value: number) {
  return `€${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}