import { parseNumberOrNull, safeParseNumber } from "./utils";

export type ImportRow = {
  product_name: string;
  description: string;
  category: string;
  collection: string;
  supplier: string;
  sku: string;
  color: string;
  size: string;
  cost: number;
  price: number | null;
  status: string;
  stock_min: number;
  stock_initial: number;
};

export function parseCsv(text: string): ImportRow[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const header = lines.shift();
  if (!header) return [];
  const headers = header.split(",").map((h) => h.trim());
  return lines.map((line) => {
    const values = line.split(",").map((value) => value.trim());
    const record: Record<string, string> = {};
    headers.forEach((key, index) => {
      record[key] = values[index] ?? "";
    });
    return {
      product_name: record.product_name,
      description: record.description,
      category: record.category,
      collection: record.collection,
      supplier: record.supplier,
      sku: record.sku,
      color: record.color,
      size: record.size,
      cost: safeParseNumber(record.cost),
      price: parseNumberOrNull(record.price),
      status: record.status || "ATIVO",
      stock_min: Number(record.stock_min) || 0,
      stock_initial: Number(record.stock_initial) || 0,
    } as ImportRow;
  });
}
