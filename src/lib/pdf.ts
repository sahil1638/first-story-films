type PdfLine = {
  text: string;
  size?: number;
  bold?: boolean;
  gapBefore?: number;
};

type PdfCommand = string;

export type PdfKeyValue = {
  label: string;
  value: string;
};

export type PdfTableColumn = {
  label: string;
  width: number;
  align?: "left" | "right";
};

export type PdfDocumentOptions = {
  title: string;
  subtitle: string;
  documentNo: string;
  meta?: PdfKeyValue[];
};

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_X = 42;
const TOP_Y = 800;
const BOTTOM_Y = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

function sanitizeText(text: string) {
  return String(text)
    .replace(/₹/g, "INR ")
    .replace(/[–—]/g, "-")
    .replace(/[•·]/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function estimateTextWidth(text: string, size: number) {
  return sanitizeText(text).length * size * 0.52;
}

function wrapText(text: string, size: number, width = CONTENT_WIDTH) {
  const maxChars = Math.max(12, Math.floor(width / (size * 0.52)));
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function textCommand(text: string, x: number, y: number, size: number, bold = false) {
  return `0.12 0.10 0.08 rg BT /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${sanitizeText(text)}) Tj ET`;
}

function rectCommand(x: number, y: number, width: number, height: number, fill?: string, stroke?: string) {
  const commands: string[] = [];
  if (fill) commands.push(`${fill} rg`);
  if (stroke) commands.push(`${stroke} RG`);
  commands.push(`${x.toFixed(1)} ${y.toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)} re ${fill && stroke ? "B" : fill ? "f" : "S"}`);
  return commands.join("\n");
}

function lineCommand(x1: number, y1: number, x2: number, y2: number, color = "0.86 0.83 0.78") {
  return `${color} RG 0.7 w ${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S`;
}

class PdfLayout {
  private pages: PdfCommand[][] = [[]];
  private y = TOP_Y;

  private get page() {
    return this.pages[this.pages.length - 1];
  }

  private push(command: PdfCommand) {
    this.page.push(command);
  }

  private ensureSpace(height: number) {
    if (this.y - height >= BOTTOM_Y) return;
    this.pages.push([]);
    this.y = TOP_Y;
  }

  private textAt(text: string, x: number, y: number, size: number, bold = false, align: "left" | "right" = "left") {
    const textX = align === "right" ? x - estimateTextWidth(text, size) : x;
    this.push(textCommand(text, textX, y, size, bold));
  }

  brandedHeader({ title, subtitle, documentNo, meta = [] }: PdfDocumentOptions) {
    const headerHeight = Math.max(118, 62 + meta.slice(0, 3).length * 28);
    this.ensureSpace(headerHeight + 18);
    this.push(rectCommand(MARGIN_X, this.y - headerHeight, CONTENT_WIDTH, headerHeight, "0.98 0.97 0.94", "0.84 0.80 0.72"));
    this.textAt("FIRST STORY FILMS", MARGIN_X + 18, this.y - 28, 11, true);
    this.textAt(title, MARGIN_X + 18, this.y - 56, 24, true);
    this.textAt(subtitle, MARGIN_X + 18, this.y - 78, 12, false);
    this.textAt(documentNo, MARGIN_X + CONTENT_WIDTH - 18, this.y - 30, 10, true, "right");

    meta.slice(0, 3).forEach((item, index) => {
      const blockY = this.y - 56 - index * 28;
      this.textAt(item.label.toUpperCase(), MARGIN_X + CONTENT_WIDTH - 18, blockY, 7, true, "right");
      this.textAt(item.value || "-", MARGIN_X + CONTENT_WIDTH - 18, blockY - 12, 9, false, "right");
    });
    this.y -= headerHeight + 22;
  }

  pageBreak() {
    if (this.y === TOP_Y) return;
    this.pages.push([]);
    this.y = TOP_Y;
  }

  section(title: string) {
    this.ensureSpace(38);
    this.y -= 12;
    this.textAt(title.toUpperCase(), MARGIN_X, this.y, 12, true);
    this.push(lineCommand(MARGIN_X, this.y - 8, MARGIN_X + CONTENT_WIDTH, this.y - 8));
    this.y -= 28;
  }

  keyValueGrid(items: PdfKeyValue[], columns = 2) {
    const gap = 14;
    const colWidth = (CONTENT_WIDTH - gap * (columns - 1)) / columns;
    const rows = Math.ceil(items.length / columns);
    const rowHeight = 44;
    this.ensureSpace(rows * rowHeight + 8);

    items.forEach((item, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = MARGIN_X + col * (colWidth + gap);
      const top = this.y - row * rowHeight;
      this.push(rectCommand(x, top - 34, colWidth, 34, "0.99 0.99 0.98", "0.88 0.86 0.82"));
      this.textAt(item.label.toUpperCase(), x + 10, top - 13, 7, true);
      this.textAt(item.value || "-", x + 10, top - 27, 9, false);
    });

    this.y -= rows * rowHeight + 4;
  }

  table(columns: PdfTableColumn[], rows: string[][]) {
    const rowHeight = 26;
    const headerHeight = 24;
    this.ensureSpace(headerHeight + rowHeight + 8);

    let x = MARGIN_X;
    this.push(rectCommand(MARGIN_X, this.y - headerHeight, CONTENT_WIDTH, headerHeight, "0.95 0.93 0.89", "0.84 0.80 0.74"));
    columns.forEach((column) => {
      this.textAt(column.label.toUpperCase(), x + 8, this.y - 16, 7, true);
      x += column.width;
    });
    this.y -= headerHeight;

    if (rows.length === 0) {
      this.ensureSpace(rowHeight);
      this.push(rectCommand(MARGIN_X, this.y - rowHeight, CONTENT_WIDTH, rowHeight, undefined, "0.88 0.86 0.82"));
      this.textAt("No records available.", MARGIN_X + 8, this.y - 17, 9);
      this.y -= rowHeight + 8;
      return;
    }

    rows.forEach((row) => {
      this.ensureSpace(rowHeight + 4);
      let cellX = MARGIN_X;
      this.push(rectCommand(MARGIN_X, this.y - rowHeight, CONTENT_WIDTH, rowHeight, undefined, "0.90 0.88 0.84"));
      row.forEach((cell, index) => {
        const column = columns[index];
        const value = cell || "-";
        const alignX = column.align === "right" ? cellX + column.width - 8 : cellX + 8;
        const clipped = value.length > Math.floor(column.width / 5) ? `${value.slice(0, Math.max(8, Math.floor(column.width / 5) - 3))}...` : value;
        this.textAt(clipped, alignX, this.y - 17, 9, false, column.align ?? "left");
        cellX += column.width;
      });
      this.y -= rowHeight;
    });
    this.y -= 10;
  }

  paragraphs(text: string) {
    const blocks = String(text || "-").split(/\n{2,}/);
    blocks.forEach((block) => {
      const lines = wrapText(block.replace(/\n/g, " "), 9.5, CONTENT_WIDTH);
      this.ensureSpace(lines.length * 15 + 8);
      lines.forEach((line) => {
        this.textAt(line, MARGIN_X, this.y, 9.5);
        this.y -= 14;
      });
      this.y -= 5;
    });
  }

  note(text: string) {
    const lines = wrapText(text, 9, CONTENT_WIDTH - 24);
    this.ensureSpace(lines.length * 14 + 28);
    const height = lines.length * 14 + 20;
    this.push(rectCommand(MARGIN_X, this.y - height, CONTENT_WIDTH, height, "0.98 0.96 0.91", "0.88 0.78 0.62"));
    lines.forEach((line, index) => {
      this.textAt(line, MARGIN_X + 12, this.y - 18 - index * 14, 9);
    });
    this.y -= height + 10;
  }

  build() {
    return buildPdf(this.pages);
  }
}

function buildPdf(pages: PdfCommand[][]) {
  const objects: string[] = [];

  function setObject(id: number, value: string) {
    objects[id] = `${id} 0 obj\n${value}\nendobj\n`;
  }

  setObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
  setObject(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  setObject(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  const kidRefs: string[] = [];
  pages.forEach((commands, index) => {
    const pageId = 5 + index * 2;
    const contentId = pageId + 1;
    kidRefs.push(`${pageId} 0 R`);

    const pageNumber = textCommand(`Page ${index + 1} of ${pages.length}`, PAGE_WIDTH - MARGIN_X - 58, 28, 8);
    const content = [...commands, lineCommand(MARGIN_X, 42, PAGE_WIDTH - MARGIN_X, 42), pageNumber].join("\n");
    setObject(contentId, `<< /Length ${Buffer.byteLength(content, "binary")} >>\nstream\n${content}\nendstream`);
    setObject(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`
    );
  });

  setObject(2, `<< /Type /Pages /Kids [${kidRefs.join(" ")}] /Count ${pages.length} >>`);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(pdf, "binary");
    pdf += objects[id];
  }

  const xrefOffset = Buffer.byteLength(pdf, "binary");
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "binary");
}

export function createPdfDocument(options: PdfDocumentOptions, render: (pdf: PdfLayout) => void) {
  const pdf = new PdfLayout();
  pdf.brandedHeader(options);
  render(pdf);
  return pdf.build();
}

export function createSimplePdf(lines: PdfLine[]) {
  return createPdfDocument(
    {
      title: lines.find((line) => (line.size ?? 0) >= 20)?.text ?? "Document",
      subtitle: "First Story Films",
      documentNo: "",
    },
    (pdf) => {
      let sectionOpen = false;
      lines.forEach((line) => {
        if ((line.size ?? 0) >= 13 && line.bold && line.text !== "FIRST STORY FILMS") {
          pdf.section(line.text);
          sectionOpen = true;
          return;
        }
        if (line.text.trim()) {
          if (!sectionOpen) pdf.section("Details");
          pdf.paragraphs(line.text);
          sectionOpen = true;
        }
      });
    }
  );
}

export function pdfSection(title: string): PdfLine[] {
  return [{ text: title, size: 13, bold: true, gapBefore: 14 }];
}
