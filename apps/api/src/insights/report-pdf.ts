import type { Report } from '@hsm/contracts';
const WIDTH = 842,
  HEIGHT = 595,
  LINE = 12,
  PER_PAGE = Math.floor((HEIGHT - 100) / LINE),
  MAX_PAGES = 400;
// Standard fonts carry Latin-1 only; other characters become '?'. Delimiters are escaped.
function pdfText(value: string) {
  return value
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}
function row(cells: string[]) {
  const width = Math.max(8, Math.floor(150 / Math.max(cells.length, 1)));
  return cells
    .map((cell) => (cell.length > width ? cell.slice(0, width - 1) + '~' : cell.padEnd(width)))
    .join(' ');
}
// RPT-001/002: a landscape, monospaced, multi-page table. Long reports paginate; the page cap
// matches the bounded row limit, so nothing is silently dropped below the report's own truncation.
export function renderReportPdf(report: Report, title: string): Buffer {
  const lines = report.rows.map(row);
  const pages: string[][] = [];
  for (
    let index = 0;
    index < Math.max(lines.length, 1) && pages.length < MAX_PAGES;
    index += PER_PAGE
  )
    pages.push(lines.slice(index, index + PER_PAGE));
  const header = [
    title,
    'Period: ' +
      (report.from ?? 'all') +
      ' to ' +
      (report.to ?? 'today') +
      (report.truncated ? ' (first 5000 rows)' : ''),
    row(report.columns),
  ];
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>',
  ];
  const kids: number[] = [];
  pages.forEach((page, pageIndex) => {
    const text = [...header, ...page, `Page ${pageIndex + 1} of ${pages.length}`]
      .map(
        (line, index) =>
          `BT /F1 ${index === 0 ? 12 : 8} Tf 36 ${HEIGHT - 40 - index * LINE} Td (${pdfText(line)}) Tj ET`,
      )
      .join('\n');
    objects.push(`<< /Length ${Buffer.byteLength(text, 'latin1')} >>\nstream\n${text}\nendstream`);
    const content = objects.length;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${WIDTH} ${HEIGHT}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${content} 0 R >>`,
    );
    kids.push(objects.length);
  });
  objects[1] = `<< /Type /Pages /Kids [${kids.map((kid) => kid + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((offset) => String(offset).padStart(10, '0') + ' 00000 n \n').join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
