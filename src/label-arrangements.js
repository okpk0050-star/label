import { LABEL_PADDING_MM, MIN_LABEL_FONT_PT, PDF_TEXT_WIDTH_FACTOR, wrapPdfText } from './pdf-layout.js';

export const LABEL_ARRANGEMENTS = [
  { id: 'basic', name: '① 기본형', description: '이름 · 주소 · 우편번호' },
  { id: 'divider', name: '② 이름 강조 + 구분선', description: '이름 아래 선으로 구분' },
  { id: 'postcode-right', name: '③ 우편번호 우측 배치', description: '우편번호를 오른쪽 아래에' },
  { id: 'compact', name: '④ 컴팩트형', description: '작은 라벨에 간결하게' },
];

const mm = 72 / 25.4;

export function labelContent(row, design) {
  const address = [design.showAddress && row.address, design.showDetail && row.detail].filter(Boolean).join(' ');
  return {
    name: design.showName && row.name ? `${row.name}${design.nameSuffix ? ` ${design.nameSuffix}` : ''}` : '',
    address,
    postcode: design.showPostcode ? row.postcodeNormalized || '' : '',
  };
}

export function layoutArrangement(content, fonts, design, box) {
  const arrangement = LABEL_ARRANGEMENTS.some((item) => item.id === design.arrangement) ? design.arrangement : 'basic';
  const width = box.width * mm;
  const height = box.height * mm;
  const padding = LABEL_PADDING_MM * mm;
  const maxTextWidth = Math.max(0, (width - padding * 2) * PDF_TEXT_WIDTH_FACTOR);
  const compact = arrangement === 'compact';
  const rightPostcode = arrangement === 'postcode-right' || compact;

  function attempt(baseSize) {
    const items = [];
    let divider = null;
    let cursor = padding;
    let fits = true;
    const gap = design.lineHeight === 0 ? 0 : Math.max(0, baseSize * (design.lineHeight - 0.8));
    const addressWeight = design.bold ? 'bold' : 'regular';
    const lineHeight = design.lineHeight === 0 ? 1 : design.lineHeight;

    function addBlock(text, size, weight, align, top, advance = true) {
      if (!text) return top;
      const font = fonts[weight];
      const lines = wrapPdfText(text, font, size, maxTextWidth);
      const step = size * lineHeight;
      lines.forEach((line, index) => {
        const measured = font.widthOfTextAtSize(line, size);
        if (measured > maxTextWidth + 0.001) fits = false;
        const x = align === 'right' ? width - padding - measured : align === 'center' ? (width - measured) / 2 : padding;
        items.push({ text: line, x, top: top + index * step, size, weight });
      });
      const bottom = top + (lines.length - 1) * step + size;
      return advance ? bottom + gap : bottom;
    }

    const nameSize = compact ? baseSize + 0.5 : baseSize + 1.5;
    cursor = addBlock(content.name, nameSize, 'bold', design.align, cursor);
    if (arrangement === 'divider' && content.name) {
      divider = { x1: padding, x2: width - padding, top: cursor - gap + 2 };
      cursor = divider.top + gap + 2;
    }
    const addressSize = compact ? Math.max(MIN_LABEL_FONT_PT, baseSize - 1) : baseSize;
    const postcodeSize = compact ? Math.max(MIN_LABEL_FONT_PT, baseSize - 1) : baseSize;
    let postcodeTop = null;
    if (rightPostcode && content.postcode) {
      postcodeTop = height - padding - postcodeSize;
      addBlock(content.postcode, postcodeSize, addressWeight, 'right', postcodeTop, false);
    }
    if (content.address) cursor = addBlock(content.address, addressSize, addressWeight, design.align, cursor);
    if (rightPostcode) {
      if (postcodeTop !== null && (content.name || content.address) && cursor > postcodeTop) fits = false;
    } else if (content.postcode) {
      cursor = addBlock(content.postcode, postcodeSize, addressWeight, design.align, cursor);
    }
    if (items.some((item) => item.top < padding - 0.001 || item.top + item.size > height - padding + 0.001)) fits = false;
    if (divider && divider.top >= height - padding) fits = false;
    return { items, divider, fits, size: baseSize };
  }

  let size = Math.max(MIN_LABEL_FONT_PT, design.fontSize);
  while (true) {
    const result = attempt(size);
    if (result.fits || size <= MIN_LABEL_FONT_PT) return result;
    size = Math.max(MIN_LABEL_FONT_PT, size - 0.5);
  }
}
