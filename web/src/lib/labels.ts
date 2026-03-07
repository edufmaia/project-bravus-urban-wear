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
  color: string;
  size: string;
  copies: number;
};

export type ExpandedLabel = Omit<LabelSkuItem, "copies"> & {
  sequence: number;
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
        color: item.color,
        size: item.size,
        sequence,
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
      color: item.color,
      size: item.size,
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
      typeof row.color === "string" &&
      typeof row.size === "string" &&
      typeof row.copies === "number"
    );
  });
}
