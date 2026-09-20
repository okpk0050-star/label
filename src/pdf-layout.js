// PDF font measurements can render slightly wider across viewers and printers.
// Reserve extra space so the final glyphs remain inside the physical label.
export const PDF_TEXT_WIDTH_FACTOR = 0.88;
export const LABEL_PADDING_MM = 2.5;
export const MIN_LABEL_FONT_PT = 8;

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

export function layoutLabelText(source, font, design, box) {
  const mm = 72 / 25.4;
  const availableWidth = Math.max(0, (box.width - LABEL_PADDING_MM * 2) * mm * PDF_TEXT_WIDTH_FACTOR);
  const availableHeight = Math.max(0, (box.height - LABEL_PADDING_MM * 2) * mm);
  let size = Math.max(MIN_LABEL_FONT_PT, design.fontSize);
  let lines = [];
  while (true) {
    lines = source.flatMap((line) => wrapPdfText(line, font, size, availableWidth));
    const fits = lines.length * size * design.lineHeight <= availableHeight + 0.001
      && lines.every((line) => font.widthOfTextAtSize(line, size) <= availableWidth + 0.001);
    if (fits || size <= MIN_LABEL_FONT_PT) return { lines, size, fits };
    size = Math.max(MIN_LABEL_FONT_PT, size - 0.5);
  }
}

export function labelPageSlots(rows, capacity, startSlot = 0) {
  const firstSlot = Math.max(0, Math.min(Number(startSlot) || 0, Math.max(0, capacity - 1)));
  const pages = [Array(capacity).fill(null)];
  let pageIndex = 0;
  let slot = firstSlot;
  for (const row of rows) {
    if (slot >= capacity) { pageIndex += 1; pages.push(Array(capacity).fill(null)); slot = 0; }
    pages[pageIndex][slot] = row;
    slot += 1;
  }
  return pages;
}

export function inspectLabelPages(rows, template, design, font, geometry, linesForRow, layout = layoutLabelText, startSlot = 0) {
  const capacity = template.cols * template.rows;
  const firstSlot = Math.max(0, Math.min(Number(startSlot) || 0, Math.max(0, capacity - 1)));
  return rows.map((row, index) => {
    const placedIndex = index + firstSlot;
    const page = Math.floor(placedIndex / capacity) + 1;
    const slot = placedIndex % capacity;
    const box = geometry(template, Math.floor(slot / template.cols), slot % template.cols, design.offsetX, design.offsetY);
    return { row, page, slot: slot + 1, box, ...layout(linesForRow(row), font, design, box) };
  });
}
