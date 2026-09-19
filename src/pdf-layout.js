// PDF font measurements can render slightly wider across viewers and printers.
// Reserve extra space so the final glyphs remain inside the physical label.
export const PDF_TEXT_WIDTH_FACTOR = 0.88;

export function wrapPdfText(text, font, size, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of String(text).trim().split(/\s+/)) {
    if (!word) continue;
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    for (const char of word) {
      if (line && font.widthOfTextAtSize(line + char, size) > maxWidth) {
        lines.push(line);
        line = char;
      } else line += char;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}
