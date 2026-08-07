export const HANGMAN_WORDS = [
  'PANCAKE', 'GALAXY', 'PUZZLE', 'HARBOR', 'WHISTLE', 'JACKET', 'MARBLE', 'CANYON',
  'LANTERN', 'VELVET', 'TROPHY', 'GARDEN', 'PENCIL', 'RIBBON', 'FOREST', 'CASTLE',
  'BUBBLE', 'ROCKET', 'SILVER', 'DESERT', 'BICYCLE', 'MEADOW', 'PIRATE', 'COTTON',
  'JOURNEY', 'WIZARD', 'BLANKET', 'CRYSTAL', 'ISLAND', 'THUNDER',
]

export const BOT_LETTER_ORDER = 'EAORISNTLUCDPMHGBYFWKVXZJQ'.split('')

export function randomWord(): string {
  return HANGMAN_WORDS[Math.floor(Math.random() * HANGMAN_WORDS.length)]
}

export function decideHangmanLetter(guessed: string[]): string {
  for (const letter of BOT_LETTER_ORDER) {
    if (!guessed.includes(letter)) return letter
  }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  return alphabet.find((l) => !guessed.includes(l)) ?? 'A'
}

export function isWordSolved(word: string, guessed: string[]): boolean {
  return word.split('').every((l) => guessed.includes(l))
}
