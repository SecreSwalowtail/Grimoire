export function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// "1 card", "3 cards", "2 copies".
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
