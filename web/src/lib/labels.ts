export type LabelTemplateId = "40x30" | "50x30" | "A4_GRID";

export type LabelTemplate = {
  id: LabelTemplateId;
  name: string;
  description: string;
  labelWidthMm: number;
  labelHeightMm: number;
  columns: number;
  gapMm: number;
  pagePaddingMm: number;
};

export type LabelSkuItem = {
  sku_id: string;
  sku: string;
  product_code: string;
  product_name: string;
  category?: string;
  color: string;
  size: string;
  product_sequence?: number;
  copies: number;
};

export type ExpandedLabel = Omit<LabelSkuItem, "copies"> & {
  sequence: number;
  barcode_value: string;
};

export type LabelPrintPayload = {
  template_id: LabelTemplateId;
  items: LabelSkuItem[];
  generated_at: string;
};

export const LABEL_TEMPLATES: LabelTemplate[] = [
  {
    id: "40x30",
    name: "40x30 mm",
    description: "4 colunas por linha",
    labelWidthMm: 40,
    labelHeightMm: 30,
    columns: 4,
    gapMm: 2,
    pagePaddingMm: 6,
  },
  {
    id: "50x30",
    name: "50x30 mm",
    description: "3 colunas por linha",
    labelWidthMm: 50,
    labelHeightMm: 30,
    columns: 3,
    gapMm: 2,
    pagePaddingMm: 6,
  },
  {
    id: "A4_GRID",
    name: "A4 multipla",
    description: "3 colunas, etiquetas 63.5x31 mm",
    labelWidthMm: 63.5,
    labelHeightMm: 31,
    columns: 3,
    gapMm: 2,
    pagePaddingMm: 6,
  },
];

export const LABEL_PRINT_STORAGE_PREFIX = "bravus-urban-wear-label-print-job:";

export const clampCopies = (value: number) => {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(500, Math.floor(value)));
};

export const getTemplateById = (templateId: LabelTemplateId) =>
  LABEL_TEMPLATES.find((template) => template.id === templateId) ?? LABEL_TEMPLATES[0];

const normalizeBarcodeSegment = (value: string, fallback: string) => {
  const normalized = value
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "");
  return normalized || fallback;
};

export const buildBravusBarcode = (item: Pick<LabelSkuItem, "product_code" | "category" | "color" | "size" | "product_sequence">) => {
  const productCode = normalizeBarcodeSegment(item.product_code ?? "", "SEMCOD");
  const category = normalizeBarcodeSegment(item.category ?? "", "SEMCAT");
  const color = normalizeBarcodeSegment(item.color ?? "", "SEMCOR");
  const size = normalizeBarcodeSegment(item.size ?? "", "SEMTAM");
  const sequenceCode =
    Number.isFinite(Number(item.product_sequence)) && Number(item.product_sequence) > 0
      ? String(Math.floor(Number(item.product_sequence)))
      : "0";
  return `BRV-${productCode}-${category}-${color}-${sequenceCode}-${size}`;
};

export function expandLabels(items: LabelSkuItem[]): ExpandedLabel[] {
  const result: ExpandedLabel[] = [];
  let sequence = 1;
  for (const item of items) {
    const copies = clampCopies(item.copies);
    for (let index = 0; index < copies; index += 1) {
      result.push({
        sku_id: item.sku_id,
        sku: item.sku,
        product_code: item.product_code,
        product_name: item.product_name,
        category: item.category ?? "",
        color: item.color,
        size: item.size,
        product_sequence: item.product_sequence ?? 0,
        sequence,
        barcode_value: buildBravusBarcode(item),
      });
      sequence += 1;
    }
  }
  return result;
}

export function sanitizePayload(payload: LabelPrintPayload): LabelPrintPayload {
  return {
    template_id: payload.template_id,
    generated_at: payload.generated_at,
    items: payload.items.map((item) => ({
      sku_id: item.sku_id,
      sku: item.sku,
      product_code: item.product_code,
      product_name: item.product_name,
      category: typeof item.category === "string" ? item.category : "",
      color: item.color,
      size: item.size,
      product_sequence: Number.isFinite(Number(item.product_sequence))
        ? Math.max(0, Math.floor(Number(item.product_sequence)))
        : 0,
      copies: clampCopies(item.copies),
    })),
  };
}

export function isLabelPrintPayload(value: unknown): value is LabelPrintPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.template_id !== "string") return false;
  if (!Array.isArray(candidate.items)) return false;
  return candidate.items.every((item) => {
    if (!item || typeof item !== "object") return false;
    const row = item as Record<string, unknown>;
    return (
      typeof row.sku_id === "string" &&
      typeof row.sku === "string" &&
      typeof row.product_code === "string" &&
      typeof row.product_name === "string" &&
      (row.category === undefined || typeof row.category === "string") &&
      typeof row.color === "string" &&
      typeof row.size === "string" &&
      (row.product_sequence === undefined || typeof row.product_sequence === "number") &&
      typeof row.copies === "number"
    );
  });
}
