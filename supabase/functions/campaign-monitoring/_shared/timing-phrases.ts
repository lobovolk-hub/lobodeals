// Preserve the existing punctuation-delimited timing scope without unanchored
// overlapping wildcards. Searching each segment once avoids cubic backtracking
// on long campaign text with repeated "sale" but no end clause.
export function campaignTimingPhrases(text: string, includeLasts = false): readonly string[] {
  const phrases: string[] = []
  const endWord = includeLasts ? /ends?|lasts|until|through/i : /ends?|until|through/i
  for (const match of text.matchAll(/[^.!?]+/g)) {
    const phrase = match[0]
    const identity = /sale|promotion|event|campaign/i.exec(phrase)
    if (identity && endWord.test(phrase.slice(identity.index + identity[0].length))) {
      phrases.push(phrase)
    }
  }
  return phrases
}
