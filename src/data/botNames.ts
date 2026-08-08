// Display names for house players. Picked at random, without repeats within a room,
// whenever a bot seat is created (host-side).
export const BOT_NAMES: string[] = [
  'Marguerite', 'Otis', 'Wren', 'Baxter', 'Iris', 'Cleo', 'Fenn', 'Nova',
  'Hazel', 'Jasper', 'Milo', 'Opal', 'Ruby', 'Felix', 'Juniper', 'Alma',
  'Bruno', 'Celia', 'Dexter', 'Elsie', 'Gus', 'Hattie', 'Ivo', 'June',
  'Kit', 'Lola', 'Mabel', 'Ned', 'Olive', 'Pearl', 'Quincy', 'Rosa',
  'Silas', 'Tilda', 'Vera', 'Wilbur', 'Yara', 'Zeke', 'Ada', 'Bea',
  'Cass', 'Dot', 'Edie', 'Flora', 'Gil', 'Ida', 'Lena', 'Moss',
  'Nell', 'Percy',
]

// Random unused pick; falls back to a numbered name if all 50 are somehow taken.
export function randomBotName(usedNames: string[]): string {
  const used = new Set(usedNames)
  const available = BOT_NAMES.filter((n) => !used.has(n))
  if (available.length === 0) return `House ${usedNames.length}`
  return available[Math.floor(Math.random() * available.length)]
}
