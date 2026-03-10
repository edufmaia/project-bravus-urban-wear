import clsx, { type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

export function formatDate(value?: string | Date) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("pt-BR").format(date);
}

function parseNumericInput(input: string): number | null {
  if (!input || !input.trim()) return null;
  const raw = input.trim().replace(/\s+/g, "").replace(/[^\d,.\-]/g, "");
  if (!raw || raw === "-" || raw === "," || raw === ".") return null;

  const hasComma = raw.includes(",");
  const hasDot = raw.includes(".");
  let normalized = raw;

  if (hasComma && hasDot) {
    const lastComma = raw.lastIndexOf(",");
    const lastDot = raw.lastIndexOf(".");
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandSeparator = decimalSeparator === "," ? "." : ",";
    normalized = raw.replace(new RegExp(`\\${thousandSeparator}`, "g"), "");
    if (decimalSeparator === ",") normalized = normalized.replace(",", ".");
  } else if (hasComma) {
    const commaCount = (raw.match(/,/g) ?? []).length;
    if (commaCount > 1) {
      const parts = raw.split(",");
      const decimal = parts.pop() ?? "";
      normalized = `${parts.join("")}.${decimal}`;
    } else {
      normalized = raw.replace(",", ".");
    }
  } else if (hasDot) {
    const dotCount = (raw.match(/\./g) ?? []).length;
    if (dotCount > 1) {
      const parts = raw.split(".");
      const decimal = parts.pop() ?? "";
      if (decimal.length <= 2) {
        normalized = `${parts.join("")}.${decimal}`;
      } else {
        normalized = raw.replace(/\./g, "");
      }
    } else {
      const [integerPart = "", decimalPart = ""] = raw.split(".");
      if (decimalPart.length === 3 && integerPart.length >= 1) {
        normalized = `${integerPart}${decimalPart}`;
      }
    }
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function safeParseNumber(input: string) {
  const parsed = parseNumericInput(input);
  return parsed ?? 0;
}

export function parseNumberOrNull(input: string) {
  return parseNumericInput(input);
}
