export interface CurateRow {
  row: number;
  source: string | null;
  id: string;
  category: string | null;
  author: string | null;
  text: string;
  stats: string | null;
  url: string | null;
  hits: number | null;
  raw: string;
}

interface ParseCurateRowsOptions {
  classificationRequired?: boolean;
}

function optionalText(value: string | undefined): string | null {
  const text = String(value || "").trim();
  return text || null;
}

function parseHits(columns: string[]): number | null {
  const hitColumn = columns.find((column) => /^hits:[0-9]+$/i.test(column));
  if (!hitColumn) return null;
  const value = Number.parseInt(hitColumn.replace(/^hits:/i, ""), 10);
  return Number.isInteger(value) ? value : null;
}

function parseNormalRow(
  row: number,
  columns: string[],
  raw: string,
): CurateRow {
  return {
    row,
    source: null,
    id: columns[1] || "",
    category: optionalText(columns[2]),
    author: optionalText(columns[3]),
    text: columns[4] || "",
    stats: optionalText(columns[5]),
    url: optionalText(columns[6]),
    hits: parseHits(columns),
    raw,
  };
}

function parseClassificationRow(
  row: number,
  columns: string[],
  raw: string,
): CurateRow {
  return {
    row,
    source: optionalText(columns[1]),
    id: columns[2] || "",
    category: null,
    author: optionalText(columns[3]),
    text: columns[4] || "",
    stats: optionalText(columns[5]),
    url: optionalText(columns[6]),
    hits: null,
    raw,
  };
}

export function parseCurateRows(
  payload: string,
  options: ParseCurateRowsOptions = {},
): CurateRow[] {
  return String(payload || "")
    .split(/\r?\n/)
    .flatMap((line): CurateRow[] => {
      const columns = line.split("\t");
      const row = Number.parseInt(columns[0] || "", 10);
      if (!Number.isInteger(row) || row <= 0) return [];
      return [
        options.classificationRequired
          ? parseClassificationRow(row, columns, line)
          : parseNormalRow(row, columns, line),
      ];
    });
}
