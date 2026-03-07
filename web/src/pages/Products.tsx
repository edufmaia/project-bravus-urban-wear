import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { AppShell } from "../components/layout/AppShell";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { Badge } from "../components/ui/Badge";
import { Input } from "../components/ui/Input";
import { formatCurrency, parseNumberOrNull, safeParseNumber } from "../lib/utils";
import { supabase } from "../lib/supabaseClient";
import { useAuth } from "../lib/auth";
import { getSignedProductImageUrl, uploadProductImage } from "../lib/storage";

const entityOrder = ["suppliers", "products", "product_skus", "stock_movements"] as const;

type SupplierRow = {
  name: string;
  email?: string;
  phone?: string;
  status?: string;
};

type ProductRow = {
  code: string;
  name: string;
  description?: string;
  category: string;
  collection?: string;
  supplier_name: string;
  status?: string;
  image_url?: string;
};

type SkuRow = {
  product_code: string;
  sku: string;
  color: string;
  size: string;
  cost: number;
  price: number | null;
  stock_min: number;
  status?: string;
};

type MovementRow = {
  sku: string;
  type: "ENTRADA" | "SAIDA" | "AJUSTE";
  quantity: number;
  reason: string;
  notes?: string;
  occurred_at?: string;
};

type ImportPreview = {
  suppliers: SupplierRow[];
  products: ProductRow[];
  skus: SkuRow[];
  movements: MovementRow[];
  errors: string[];
  warnings: string[];
};

const normalizeKey = (value: string) => value.trim().toLowerCase().replace(/\s+/g, "_");

const toSupplierRow = (record: Record<string, string>): SupplierRow => ({
  name: record.name ?? "",
  email: record.email || undefined,
  phone: record.phone || undefined,
  status: record.status || "ATIVO",
});

const toProductRow = (record: Record<string, string>): ProductRow => ({
  code: record.code ?? "",
  name: record.name ?? "",
  description: record.description || undefined,
  category: record.category ?? "",
  collection: record.collection || undefined,
  supplier_name: record.supplier_name ?? "",
  status: record.status || "ATIVO",
  image_url: record.image_url || undefined,
});

const toSkuRow = (record: Record<string, string>): SkuRow => ({
  product_code: record.product_code ?? "",
  sku: record.sku ?? "",
  color: record.color ?? "",
  size: record.size ?? "",
  cost: safeParseNumber(record.cost),
  price: parseNumberOrNull(record.price),
  stock_min: Number(record.stock_min) || 0,
  status: record.status || "ATIVO",
});

const toMovementRow = (record: Record<string, string>): MovementRow => ({
  sku: record.sku ?? "",
  type: (record.type as MovementRow["type"]) ?? "ENTRADA",
  quantity: Number(record.quantity) || 0,
  reason: record.reason ?? "",
  notes: record.notes || undefined,
  occurred_at: record.occurred_at || undefined,
});

const buildPreview = () =>
  ({
    suppliers: [],
    products: [],
    skus: [],
    movements: [],
    errors: [],
    warnings: [],
  }) as ImportPreview;

const validatePreview = (preview: ImportPreview) => {
  preview.suppliers.forEach((row, index) => {
    if (!row.name) preview.errors.push(`Fornecedor linha ${index + 1}: nome obrigatório.`);
  });
  preview.products.forEach((row, index) => {
    if (!row.code) preview.errors.push(`Produto linha ${index + 1}: código obrigatório.`);
    if (!row.name) preview.errors.push(`Produto linha ${index + 1}: nome obrigatório.`);
    if (!row.category) preview.errors.push(`Produto linha ${index + 1}: categoria obrigatória.`);
    if (!row.supplier_name) preview.errors.push(`Produto linha ${index + 1}: fornecedor obrigatório.`);
  });
  const codeMap = new Map<string, string>();
  preview.products.forEach((row, index) => {
    if (!row.code) return;
    if (codeMap.has(row.code) && codeMap.get(row.code) !== row.name) {
      preview.errors.push(`Produto linha ${index + 1}: código duplicado com nome diferente (${row.code}).`);
    }
    codeMap.set(row.code, row.name);
  });
  preview.skus.forEach((row, index) => {
    if (!row.product_code) preview.errors.push(`SKU linha ${index + 1}: product_code obrigatório.`);
    if (!row.sku) preview.errors.push(`SKU linha ${index + 1}: sku obrigatório.`);
    if (!row.color) preview.errors.push(`SKU linha ${index + 1}: cor obrigatória.`);
    if (!row.size) preview.errors.push(`SKU linha ${index + 1}: tamanho obrigatório.`);
    if (!row.cost && row.cost !== 0) preview.errors.push(`SKU linha ${index + 1}: custo inválido.`);
  });
  preview.movements.forEach((row, index) => {
    if (!row.sku) preview.errors.push(`Movimento linha ${index + 1}: sku obrigatório.`);
    if (!row.type) preview.errors.push(`Movimento linha ${index + 1}: type obrigatório.`);
    if (!row.quantity) preview.errors.push(`Movimento linha ${index + 1}: quantidade inválida.`);
    if (!row.reason) preview.errors.push(`Movimento linha ${index + 1}: reason obrigatório.`);
  });
};

const parseCsvLine = (line: string, delimiter: string) => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"") {
      const nextChar = line[i + 1];
      if (inQuotes && nextChar === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  result.push(current);
  return result;
};

const parseCsvImport = (text: string): ImportPreview => {
  const preview = buildPreview();
  const normalized = text.replace(/^\ufeff/, "");
  const lines = normalized.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const headerLine = lines.shift();
  const delimiter = headerLine?.includes(";") ? ";" : ",";
  if (!headerLine) {
    preview.errors.push("CSV vazio.");
    return preview;
  }
  const headers = parseCsvLine(headerLine, delimiter).map((h) => normalizeKey(h.replace(/^\ufeff/, "").trim()));
  const entityIndex = headers.indexOf("entity");
  if (entityIndex === -1) {
    preview.errors.push("CSV precisa da coluna 'entity'.");
    return preview;
  }
  let lastEntityIndex = 0;
  lines.forEach((line, index) => {
    const values = parseCsvLine(line, delimiter).map((value) => value.trim());
    const record: Record<string, string> = {};
    headers.forEach((key, idx) => {
      record[key] = values[idx] ?? "";
    });
    const entity = normalizeKey(record.entity || "");
    const orderIndex = entityOrder.indexOf(entity as any);
    if (orderIndex === -1) {
      preview.errors.push(`Linha ${index + 1}: entity inválida (${record.entity}).`);
      return;
    }
    if (orderIndex < lastEntityIndex) {
      preview.errors.push(
        `Linha ${index + 1}: ordem inválida. Use suppliers -> products -> product_skus -> stock_movements.`
      );
      return;
    }
    lastEntityIndex = orderIndex;
    if (entity === "suppliers") preview.suppliers.push(toSupplierRow(record));
    if (entity === "products") preview.products.push(toProductRow(record));
    if (entity === "product_skus") preview.skus.push(toSkuRow(record));
    if (entity === "stock_movements") preview.movements.push(toMovementRow(record));
  });
  validatePreview(preview);
  return preview;
};
const parseXlsxImport = (buffer: ArrayBuffer): ImportPreview => {
  const preview = buildPreview();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetNames = workbook.SheetNames.map((name) => normalizeKey(name));
  let lastIndex = -1;
  entityOrder.forEach((entity) => {
    const currentIndex = sheetNames.indexOf(entity);
    if (currentIndex !== -1 && currentIndex < lastIndex) {
      preview.errors.push(`Sheet '${entity}' está fora da ordem obrigatória.`);
    }
    if (currentIndex !== -1) lastIndex = currentIndex;
  });
  const getSheet = (entity: typeof entityOrder[number]) => {
    const sheetName = workbook.SheetNames.find((name) => normalizeKey(name) === entity);
    if (!sheetName) return [];
    return XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets[sheetName], { defval: "" });
  };
  const suppliers = getSheet("suppliers");
  const products = getSheet("products");
  const skus = getSheet("product_skus");
  const movements = getSheet("stock_movements");
  suppliers.forEach((row) => preview.suppliers.push(toSupplierRow(row)));
  products.forEach((row) => preview.products.push(toProductRow(row)));
  skus.forEach((row) => preview.skus.push(toSkuRow(row)));
  movements.forEach((row) => preview.movements.push(toMovementRow(row)));
  if (!suppliers.length && !products.length && !skus.length) {
    preview.errors.push("XLSX sem sheets válidos (suppliers, products, product_skus).");
  }
  validatePreview(preview);
  return preview;
};

type ProductPtRow = {
  code: string;
  name: string;
  description?: string;
  category: string;
  status?: string;
  collection?: string;
  supplier_name?: string;
};

type ProductPtPreview = {
  rows: ProductPtRow[];
  errors: string[];
  errorCount: number;
  warnings: string[];
  duplicates: string[];
  supplierMissing: string[];
};

const productsPtColumns = [
  "Código do Produto",
  "Nome do Produto",
  "Descrição",
  "Categoria",
  "Status",
  "Coleção",
  "Fornecedor",
];

const normalizeHeaderPt = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

const productsPtHeaderMap = new Map([
  ["codigo do produto", "code"],
  ["nome do produto", "name"],
  ["descricao", "description"],
  ["categoria", "category"],
  ["status", "status"],
  ["colecao", "collection"],
  ["fornecedor", "supplier_name"],
]);

const buildProductsPtPreview = (raw: Record<string, string>[]): ProductPtPreview => {
  const preview: ProductPtPreview = {
    rows: [],
    errors: [],
    errorCount: 0,
    warnings: [],
    duplicates: [],
    supplierMissing: [],
  };
  if (!raw.length) {
    preview.errors.push("Arquivo sem linhas válidas.");
    return preview;
  }
  const headers = Object.keys(raw[0] ?? {});
  const normalizedHeaders = headers.map((h) => normalizeHeaderPt(h));
  const missingHeaders = productsPtColumns.filter(
    (header) => !normalizedHeaders.includes(normalizeHeaderPt(header))
  );
  if (missingHeaders.length) {
    preview.errors.push(`Colunas obrigatórias ausentes: ${missingHeaders.join(", ")}.`);
    return preview;
  }
  const seenCodes = new Set<string>();
  const errorRows = new Set<number>();
  raw.forEach((row, index) => {
    const record: Record<string, string> = {};
    headers.forEach((header) => {
      const normalized = normalizeHeaderPt(header);
      const key = productsPtHeaderMap.get(normalized);
      if (key) record[key] = row[header] ?? "";
    });
    const isEmptyRow = Object.values(record).every((value) => !value || !value.trim());
    if (isEmptyRow) return;
    const rawStatus = record.status?.trim() ?? "";
    const normalizedStatus = normalizeHeaderPt(rawStatus);
    const status =
      normalizedStatus === "active"
        ? "ATIVO"
        : normalizedStatus === "inactive"
          ? "INATIVO"
          : rawStatus || "ATIVO";
    const code = record.code?.trim() ?? "";
    const name = record.name?.trim() ?? "";
    const category = record.category?.trim() ?? "";
    if (!code) {
      preview.errors.push(`Linha ${index + 2}: Código do Produto obrigatório.`);
      errorRows.add(index);
    }
    if (!name) {
      preview.errors.push(`Linha ${index + 2}: Nome do Produto obrigatório.`);
      errorRows.add(index);
    }
    if (!category) {
      preview.errors.push(`Linha ${index + 2}: Categoria obrigatória.`);
      errorRows.add(index);
    }
    if (code) {
      if (seenCodes.has(code)) {
        preview.duplicates.push(code);
        errorRows.add(index);
      }
      seenCodes.add(code);
    }
    preview.rows.push({
      code,
      name,
      description: record.description?.trim() || undefined,
      category,
      status,
      collection: record.collection?.trim() || undefined,
      supplier_name: record.supplier_name?.trim() || undefined,
    });
  });
  preview.errorCount = errorRows.size;
  return preview;
};

const parseProductsPtXlsx = (buffer: ArrayBuffer): ProductPtPreview => {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames.find(
    (name) => normalizeHeaderPt(name) === normalizeHeaderPt("Produtos")
  );
  if (!sheetName) {
    return {
      rows: [],
      errors: ["XLSX sem aba 'Produtos'."],
      errorCount: 1,
      warnings: [],
      duplicates: [],
      supplierMissing: [],
    };
  }
  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: "" });
  if (!raw.length) {
    return {
      rows: [],
      errors: ["Aba 'Produtos' está vazia."],
      errorCount: 1,
      warnings: [],
      duplicates: [],
      supplierMissing: [],
    };
  }
  return buildProductsPtPreview(raw);
};

const parseProductsPtCsv = (text: string): ProductPtPreview => {
  const normalized = text.replace(/^\ufeff/, "");
  const lines = normalized.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (!lines.length) {
    return {
      rows: [],
      errors: ["CSV vazio."],
      errorCount: 1,
      warnings: [],
      duplicates: [],
      supplierMissing: [],
    };
  }
  const headerLine = lines[0].trim();
  const delimiter = headerLine.includes(";") ? ";" : ",";
  const headers = parseCsvLine(headerLine, delimiter).map((h) => h.replace(/^\ufeff/, "").trim());
  const records: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i], delimiter);
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = values[index]?.trim() ?? "";
    });
    records.push(record);
  }
  return buildProductsPtPreview(records);
};

export function Products() {
  const { profile } = useAuth();
  const role = profile?.role ?? "VISUALIZADOR";
  const canManageCatalog = ["ADMIN", "GERENTE"].includes(role);
  const canWriteMedia = ["ADMIN", "GERENTE", "OPERADOR"].includes(role);
  const [products, setProducts] = useState<any[]>([]);
  const [skus, setSkus] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importPtPreview, setImportPtPreview] = useState<ProductPtPreview | null>(null);
  const [importMode, setImportMode] = useState<"multi" | "produtos_pt">("multi");
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [importState, setImportState] = useState({
    file: null as File | null,
    progress: 0,
    status: "idle" as "idle" | "running" | "done" | "error",
    message: "",
  });
  const [actionError, setActionError] = useState<string | null>(null);

  const [productModalOpen, setProductModalOpen] = useState(false);
  const [skuModalOpen, setSkuModalOpen] = useState(false);
  const [imageModal, setImageModal] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageObjectUrl, setImageObjectUrl] = useState<string | null>(null);
  const [existingImagePath, setExistingImagePath] = useState<string | null>(null);
  const [signedImageUrls, setSignedImageUrls] = useState<Record<string, string>>({});
  const [productForm, setProductForm] = useState({
    id: "",
    code: "",
    name: "",
    description: "",
    category: "",
    collection: "",
    supplier_id: "",
    status: "ATIVO",
  });
  const [skuForm, setSkuForm] = useState({
    id: "",
    product_id: "",
    sku: "",
    color: "",
    size: "",
    cost: "",
    price: "",
    stock_min: "",
    status: "ATIVO",
  });

  const loadData = async () => {
    const { data: productsData } = await supabase
      .from("products")
      .select("id, code, name, description, category, collection, image_url, status, supplier_id, suppliers(name)")
      .order("created_at", { ascending: false });
    const { data: skusData } = await supabase
      .from("product_skus")
      .select("id, product_id, sku, color, size, cost, price, stock_current, stock_min, status, products(name, code)")
      .order("created_at", { ascending: false });
    const { data: suppliersData } = await supabase.from("suppliers").select("id, name").order("name");
    setProducts(productsData ?? []);
    setSkus(skusData ?? []);
    setSuppliers(suppliersData ?? []);
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!products.length) return;
    let active = true;
    const loadSignedUrls = async () => {
      const entries = await Promise.all(
        products.map(async (product) => {
          if (!product.image_url) return null;
          const url = await getSignedProductImageUrl(product.image_url);
          return url ? [product.image_url, url] : null;
        })
      );
      if (!active) return;
      setSignedImageUrls((prev) => {
        const next = { ...prev };
        entries.forEach((entry) => {
          if (!entry) return;
          const [path, url] = entry;
          next[path] = url;
        });
        return next;
      });
    };
    loadSignedUrls();
    return () => {
      active = false;
    };
  }, [products]);

  useEffect(() => {
    if (!importPtPreview) return;
    if (!suppliers.length) return;
    const supplierNames = new Set(suppliers.map((supplier) => supplier.name));
    const missing = new Set<string>();
    importPtPreview.rows.forEach((row) => {
      if (row.supplier_name && !supplierNames.has(row.supplier_name)) {
        missing.add(row.supplier_name);
      }
    });
    setImportPtPreview((prev) =>
      prev
        ? {
            ...prev,
            supplierMissing: Array.from(missing),
          }
        : prev
    );
  }, [importPtPreview, suppliers]);

  useEffect(() => {
    if (!imageFile) {
      setImageObjectUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(imageFile);
    setImageObjectUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [imageFile]);

  const openNewProduct = () => {
    setProductForm({
      id: "",
      code: "",
      name: "",
      description: "",
      category: "",
      collection: "",
      supplier_id: "",
      status: "ATIVO",
    });
    setExistingImagePath(null);
    setImageFile(null);
    setProductModalOpen(true);
  };

  const openEditProduct = (product: any) => {
    setProductForm({
      id: product.id,
      code: product.code ?? "",
      name: product.name ?? "",
      description: product.description ?? "",
      category: product.category ?? "",
      collection: product.collection ?? "",
      supplier_id: product.supplier_id ?? "",
      status: product.status ?? "ATIVO",
    });
    setExistingImagePath(product.image_url ?? null);
    setImageFile(null);
    setProductModalOpen(true);
  };

  const openNewSku = () => {
    setSkuForm({
      id: "",
      product_id: products[0]?.id ?? "",
      sku: "",
      color: "",
      size: "",
      cost: "",
      price: "",
      stock_min: "",
      status: "ATIVO",
    });
    setSkuModalOpen(true);
  };

  const openEditSku = (sku: any) => {
    setSkuForm({
      id: sku.id,
      product_id: sku.product_id ?? "",
      sku: sku.sku ?? "",
      color: sku.color ?? "",
      size: sku.size ?? "",
      cost: sku.cost?.toString() ?? "",
      price: sku.price?.toString() ?? "",
      stock_min: sku.stock_min?.toString() ?? "",
      status: sku.status ?? "ATIVO",
    });
    setSkuModalOpen(true);
  };

  const saveProduct = async () => {
    if (!canManageCatalog) {
      setActionError("Apenas ADMIN/GERENTE pode criar/editar produtos.");
      return;
    }
    setActionError(null);
    if (!productForm.code || !productForm.name || !productForm.category || !productForm.supplier_id) {
      setActionError("Preencha código, nome, categoria e fornecedor.");
      return;
    }
    const { data: existing } = await supabase
      .from("products")
      .select("id")
      .eq("code", productForm.code)
      .maybeSingle();
    if (existing?.id && existing.id !== productForm.id) {
      setActionError("Já existe um produto com este código.");
      return;
    }
    const payload = {
      code: productForm.code,
      name: productForm.name,
      description: productForm.description || null,
      category: productForm.category,
      collection: productForm.collection || null,
      supplier_id: productForm.supplier_id,
      status: productForm.status,
    };
    const response = productForm.id
      ? await supabase.from("products").update(payload).eq("id", productForm.id).select("id").single()
      : await supabase.from("products").insert(payload).select("id").single();
    if (response.error) {
      setActionError("Não foi possível salvar o produto.");
      return;
    }
    const productId = productForm.id || response.data?.id;
    if (imageFile && productId) {
      try {
        const imagePath = await uploadProductImage(productId, imageFile);
        const { error: imageError } = await supabase
          .from("products")
          .update({ image_url: imagePath })
          .eq("id", productId);
        if (imageError) {
          setActionError("Produto salvo, mas não foi possível associar a imagem.");
          return;
        }
      } catch {
        setActionError("Produto salvo, mas falha no upload da imagem.");
        return;
      }
    }
    setProductModalOpen(false);
    setImageFile(null);
    setExistingImagePath(null);
    await loadData();
  };

  const deleteProduct = async (productId: string) => {
    if (!canManageCatalog) return;
    const { count } = await supabase
      .from("product_skus")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId);
    if ((count ?? 0) > 0) {
      setActionError("Remova os SKUs antes de excluir o produto.");
      return;
    }
    const { error } = await supabase.from("products").delete().eq("id", productId);
    if (error) {
      setActionError("Não foi possível excluir o produto.");
      return;
    }
    await loadData();
  };

  const saveSku = async () => {
    if (!canManageCatalog) {
      setActionError("Apenas ADMIN/GERENTE pode criar/editar SKUs.");
      return;
    }
    setActionError(null);
    if (!skuForm.product_id || !skuForm.sku || !skuForm.color || !skuForm.size) {
      setActionError("Preencha SKU, produto, cor e tamanho.");
      return;
    }
    const payload = {
      product_id: skuForm.product_id,
      sku: skuForm.sku,
      color: skuForm.color,
      size: skuForm.size,
      cost: safeParseNumber(skuForm.cost),
      price: parseNumberOrNull(skuForm.price) ?? null,
      stock_min: Number(skuForm.stock_min) || 0,
      status: skuForm.status,
    };
    const response = skuForm.id
      ? await supabase.from("product_skus").update(payload).eq("id", skuForm.id)
      : await supabase.from("product_skus").insert(payload);
    if (response.error) {
      setActionError("Não foi possível salvar o SKU.");
      return;
    }
    setSkuModalOpen(false);
    await loadData();
  };

  const deleteSku = async (skuId: string) => {
    if (!canManageCatalog) return;
    const { error } = await supabase.from("product_skus").delete().eq("id", skuId);
    if (error) {
      setActionError("Não foi possível excluir o SKU.");
      return;
    }
    await loadData();
  };

  const readImportFile = async (file: File) => {
    const isXlsx = file.name.toLowerCase().endsWith(".xlsx");
    if (isXlsx) {
      const buffer = await file.arrayBuffer();
      return parseXlsxImport(buffer);
    }
    const text = await file.text();
    return parseCsvImport(text);
  };

  const readImportProductsPt = async (file: File) => {
    const isCsv = file.name.toLowerCase().endsWith(".csv");
    if (isCsv) {
      const text = await file.text();
      return parseProductsPtCsv(text);
    }
    const buffer = await file.arrayBuffer();
    return parseProductsPtXlsx(buffer);
  };

  const handleImportPreview = async (file: File) => {
    setActionError(null);
    setImportSummary(null);
    setImportState((prev) => ({ ...prev, status: "idle", message: "Analisando arquivo..." }));
    const isCsv = file.name.toLowerCase().endsWith(".csv");
    if (isCsv) {
      const text = await file.text();
      const normalized = text.replace(/^\ufeff/, "");
      const firstLine = normalized.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
      const delimiter = firstLine.includes(";") ? ";" : ",";
      const headers = parseCsvLine(firstLine, delimiter).map((h) => normalizeHeaderPt(h));
      const hasEntity = headers.includes("entity");
      const hasCodigoProduto = headers.includes(normalizeHeaderPt("Código do Produto"));
      if (hasEntity) {
        setImportMode("multi");
        const preview = parseCsvImport(normalized);
        setImportPtPreview(null);
        setImportPreview(preview);
        if (preview.errors.length > 0) {
          setImportState((prev) => ({ ...prev, status: "error", message: "Erros encontrados no arquivo." }));
        } else {
          setImportState((prev) => ({ ...prev, status: "idle", message: "Arquivo pronto para importação." }));
        }
        return;
      }
      if (hasCodigoProduto) {
        setImportMode("produtos_pt");
        const preview = parseProductsPtCsv(normalized);
        setImportPreview(null);
        setImportPtPreview(preview);
        if (preview.errors.length > 0) {
          setImportState((prev) => ({ ...prev, status: "error", message: "Erros encontrados no arquivo." }));
        } else {
          setImportState((prev) => ({ ...prev, status: "idle", message: "Arquivo pronto para importação." }));
        }
        return;
      }
      setImportPtPreview(null);
      setImportPreview(null);
      setImportState((prev) => ({ ...prev, status: "error", message: "CSV inválido: cabeçalho não reconhecido." }));
      return;
    }
    if (importMode === "produtos_pt") {
      const preview = await readImportProductsPt(file);
      setImportPreview(null);
      setImportPtPreview(preview);
      if (preview.errors.length > 0) {
        setImportState((prev) => ({ ...prev, status: "error", message: "Erros encontrados no arquivo." }));
      } else {
        setImportState((prev) => ({ ...prev, status: "idle", message: "Arquivo pronto para importação." }));
      }
      return;
    }
    const preview = await readImportFile(file);
    setImportPtPreview(null);
    setImportPreview(preview);
    if (preview.errors.length > 0) {
      setImportState((prev) => ({ ...prev, status: "error", message: "Erros encontrados no arquivo." }));
    } else {
      setImportState((prev) => ({ ...prev, status: "idle", message: "Arquivo pronto para importação." }));
    }
  };
  const handleImportConfirm = async () => {
    if (!canManageCatalog) {
      setActionError("Apenas ADMIN/GERENTE pode importar produtos.");
      return;
    }
    const currentPreview = importMode === "produtos_pt" ? importPtPreview : importPreview;
    if (!currentPreview) return;
    if (importMode === "produtos_pt") {
      if (currentPreview.errors.length > 0) return;
    } else if (currentPreview.errors.length > 0) {
      return;
    }
    setImportState((prev) => ({ ...prev, status: "running", progress: 0, message: "Iniciando importação..." }));

    const inserted = {
      suppliers: [] as string[],
      products: [] as string[],
      skus: [] as string[],
      movements: [] as string[],
    };
    try {
      const { data: existingSuppliers } = await supabase.from("suppliers").select("id, name");
      const supplierMap = new Map((existingSuppliers ?? []).map((s) => [s.name, s.id]));

      if (importMode === "multi" && importPreview) {
        for (const supplier of importPreview.suppliers) {
          if (!supplier.name) continue;
          if (!supplierMap.has(supplier.name)) {
            const { data, error } = await supabase
              .from("suppliers")
              .insert({
                name: supplier.name,
                email: supplier.email,
                phone: supplier.phone,
                status: supplier.status ?? "ATIVO",
              })
              .select("id")
              .single();
            if (error) throw error;
            supplierMap.set(supplier.name, data.id);
            inserted.suppliers.push(data.id);
          }
        }
      }

      const { data: existingProducts } = await supabase.from("products").select("id, code, name");
      const productMap = new Map((existingProducts ?? []).map((p) => [p.code, p]));

      let ignoredDuplicates = 0;
      let ignoredSupplierMissing = 0;
      let errorsCount = 0;
      if (importMode === "produtos_pt" && importPtPreview) {
        const supplierMissing = new Set<string>();
        const fileDuplicates = new Set(importPtPreview.duplicates);
        for (const product of importPtPreview.rows) {
          if (!product.code || !product.name || !product.category) {
            errorsCount += 1;
            continue;
          }
          if (fileDuplicates.has(product.code)) {
            ignoredDuplicates += 1;
            continue;
          }
          const existing = productMap.get(product.code);
          if (existing) {
            ignoredDuplicates += 1;
            continue;
          }
          let supplierId = null as string | null;
          if (product.supplier_name) {
            supplierId = supplierMap.get(product.supplier_name) ?? null;
            if (!supplierId) {
              supplierMissing.add(product.supplier_name);
              ignoredSupplierMissing += 1;
            }
          }
          const { data, error } = await supabase
            .from("products")
            .insert({
              code: product.code,
              name: product.name,
              description: product.description ?? null,
              category: product.category,
              collection: product.collection ?? null,
              supplier_id: supplierId,
              status: product.status ?? "ATIVO",
              image_url: null,
            })
            .select("id, code, name")
            .single();
          if (error) throw error;
          productMap.set(product.code, data);
          inserted.products.push(data.id);
        }
        setImportPtPreview((prev) =>
          prev
            ? {
                ...prev,
                supplierMissing: Array.from(supplierMissing),
              }
            : prev
        );
      } else if (importPreview) {
        for (const product of importPreview.products) {
          const supplierId = supplierMap.get(product.supplier_name);
          if (!supplierId) throw new Error(`Fornecedor não encontrado: ${product.supplier_name}`);
          const existing = productMap.get(product.code);
          if (existing && existing.name !== product.name) {
            throw new Error(`Código duplicado com produto diferente: ${product.code}`);
          }
          if (!existing) {
            const { data, error } = await supabase
              .from("products")
              .insert({
                code: product.code,
                name: product.name,
                description: product.description ?? null,
                category: product.category,
                collection: product.collection ?? null,
                supplier_id: supplierId,
                status: product.status ?? "ATIVO",
                image_url: product.image_url ?? null,
              })
              .select("id, code, name")
              .single();
            if (error) throw error;
            productMap.set(product.code, data);
            inserted.products.push(data.id);
          }
        }
      }

      if (importMode === "multi" && importPreview) {
        const { data: existingSkus } = await supabase.from("product_skus").select("id, sku");
        const skuMap = new Map((existingSkus ?? []).map((s) => [s.sku, s.id]));

        for (const sku of importPreview.skus) {
          const product = productMap.get(sku.product_code);
          if (!product) throw new Error(`Produto não encontrado: ${sku.product_code}`);
          if (!skuMap.has(sku.sku)) {
            const { data, error } = await supabase
              .from("product_skus")
              .insert({
                product_id: product.id,
                sku: sku.sku,
                color: sku.color,
                size: sku.size,
                cost: sku.cost,
                price: sku.price,
                stock_min: sku.stock_min,
                status: sku.status ?? "ATIVO",
              })
              .select("id")
              .single();
            if (error) throw error;
            skuMap.set(sku.sku, data.id);
            inserted.skus.push(data.id);
          }
        }

        for (const movement of importPreview.movements) {
          const skuId = skuMap.get(movement.sku);
          if (!skuId) throw new Error(`SKU não encontrado: ${movement.sku}`);
          const signed =
            movement.type === "ENTRADA"
              ? movement.quantity
              : movement.type === "SAIDA"
                ? -movement.quantity
                : movement.quantity;
          const { data, error } = await supabase
            .from("stock_movements")
            .insert({
              sku_id: skuId,
              type: movement.type,
              quantity: movement.quantity,
              signed_quantity: signed,
              reason: movement.reason,
              notes: movement.notes ?? null,
              occurred_at: movement.occurred_at ?? undefined,
            })
            .select("id")
            .single();
          if (error) throw error;
          inserted.movements.push(data.id);
        }
      }

      setImportState({
        file: null,
        progress: 100,
        status: "done",
        message: "Importação concluída com sucesso.",
      });
      if (importMode === "produtos_pt") {
        setImportSummary(
          `Inseridos: ${inserted.products.length} • Duplicados/ignorados: ${ignoredDuplicates} • ` +
            `Fornecedor não encontrado: ${ignoredSupplierMissing} • Erros: ${errorsCount}`
        );
      }
      setImportPreview(null);
      setImportPtPreview(null);
      await loadData();
    } catch (error: any) {
      if (inserted.movements.length) await supabase.from("stock_movements").delete().in("id", inserted.movements);
      if (inserted.skus.length) await supabase.from("product_skus").delete().in("id", inserted.skus);
      if (inserted.products.length) await supabase.from("products").delete().in("id", inserted.products);
      if (inserted.suppliers.length) await supabase.from("suppliers").delete().in("id", inserted.suppliers);
      setImportState({
        file: null,
        progress: 100,
        status: "error",
        message: error?.message ?? "Falha na importação. Rollback executado.",
      });
    }
  };

  const handleExportCsv = () => {
    const header = "product_code,product_name,sku,color,size,cost,price,status,stock_min,stock_current";
    const lines = skus.map((sku) => {
      return [
        sku.products?.code ?? "",
        sku.products?.name ?? "",
        sku.sku,
        sku.color,
        sku.size,
        sku.cost ?? "",
        sku.price ?? "",
        sku.status ?? "ATIVO",
        sku.stock_min ?? 0,
        sku.stock_current ?? 0,
      ].join(",");
    });
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "bravus-urban-wear-produtos.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportXlsx = () => {
    const rows = skus.map((sku) => ({
      product_code: sku.products?.code ?? "",
      product_name: sku.products?.name ?? "",
      sku: sku.sku,
      color: sku.color,
      size: sku.size,
      cost: sku.cost ?? "",
      price: sku.price ?? "",
      status: sku.status ?? "ATIVO",
      stock_min: sku.stock_min ?? 0,
      stock_current: sku.stock_current ?? 0,
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "product_skus");
    XLSX.writeFile(workbook, "bravus-urban-wear-produtos.xlsx");
  };

  const handleExportTemplatePt = () => {
    const worksheet = XLSX.utils.aoa_to_sheet([productsPtColumns]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Produtos");
    XLSX.writeFile(workbook, "bravus-urban-wear-modelo-produtos.xlsx");
  };

  const totalSkus = useMemo(() => skus.length, [skus]);
  const noPriceCount = useMemo(() => skus.filter((sku) => sku.price === null).length, [skus]);
  const priceByProduct = useMemo(() => {
    const map = new Map<string, number[]>();
    skus.forEach((sku) => {
      if (!sku.product_id) return;
      if (sku.price === null || sku.price === undefined) return;
      if (!map.has(sku.product_id)) map.set(sku.product_id, []);
      map.get(sku.product_id)?.push(Number(sku.price));
    });
    return map;
  }, [skus]);
  const productImageUrl = imageFile
    ? imageObjectUrl
    : existingImagePath
      ? signedImageUrls[existingImagePath]
      : null;

  return (
    <AppShell
      title="Produtos"
      actions={
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => setImportOpen(true)} disabled={!canManageCatalog}>
            Importar CSV/XLSX
          </Button>
          <Button variant="ghost" onClick={handleExportTemplatePt}>
            Baixar modelo XLSX
          </Button>
          <Button variant="outline" onClick={handleExportCsv}>
            Exportar CSV
          </Button>
          <Button variant="outline" onClick={handleExportXlsx}>
            Exportar XLSX
          </Button>
          <Button onClick={openNewProduct} disabled={!canManageCatalog}>
            Novo produto
          </Button>
          <Button onClick={openNewSku} disabled={!canManageCatalog}>
            Novo SKU
          </Button>
        </div>
      }
    >
      {actionError && <p className="text-sm text-ember">{actionError}</p>}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase text-steel">Produtos cadastrados</p>
            <p className="text-2xl font-semibold">{products.length} produtos</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">{totalSkus} SKUs ativos</Badge>
            {noPriceCount > 0 && <Badge tone="warning">{noPriceCount} sem preço de venda</Badge>}
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase text-steel">Lista de produtos</p>
            <p className="text-lg font-semibold">Produtos principais</p>
          </div>
        </div>
        <div className="mt-4 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-steel">
              <tr>
                <th className="py-2">Foto</th>
                <th>Nome</th>
                <th>Código</th>
                <th>Descrição</th>
                <th>Categoria</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {products.map((product) => {
                const prices = priceByProduct.get(product.id) ?? [];
                const value = prices.length ? Math.min(...prices) : null;
                const imagePath = product.image_url;
                const signedUrl = imagePath ? signedImageUrls[imagePath] : null;
                return (
                  <tr key={product.id} className="text-sm">
                    <td className="py-3">
                      {signedUrl ? (
                        <img
                          src={signedUrl}
                          alt={product.name}
                          className="h-10 w-10 rounded-xl object-cover cursor-pointer"
                          onClick={() => setImageModal(signedUrl)}
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-xl bg-black/5" />
                      )}
                    </td>
                    <td className="font-semibold">{product.name}</td>
                    <td>{product.code}</td>
                    <td className="max-w-[200px] truncate">{product.description ?? "-"}</td>
                    <td>{product.category}</td>
                    <td>
                      {value === null ? <Badge tone="warning">Sem preço de venda</Badge> : formatCurrency(value)}
                    </td>
                    <td>
                      <Badge tone={product.status === "ATIVO" ? "success" : "neutral"}>{product.status}</Badge>
                    </td>
                    <td>
                      {canManageCatalog ? (
                        <div className="flex gap-2">
                          <Button variant="outline" onClick={() => openEditProduct(product)}>
                            Editar
                          </Button>
                          <Button variant="ghost" onClick={() => deleteProduct(product.id)}>
                            Excluir
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-steel">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-6">
        <p className="text-xs uppercase text-steel">SKUs e variações</p>
        <div className="mt-4 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-steel">
              <tr>
                <th className="py-2">SKU</th>
                <th>Produto</th>
                <th>Cor</th>
                <th>Tamanho</th>
                <th>Custo</th>
                <th>Preço</th>
                <th>Estoque</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {skus.map((sku) => (
                <tr key={sku.id}>
                  <td className="py-3 font-semibold">{sku.sku}</td>
                  <td>{sku.products?.name}</td>
                  <td>{sku.color}</td>
                  <td>{sku.size}</td>
                  <td>{canManageCatalog ? formatCurrency(Number(sku.cost)) : "-"}</td>
                  <td>
                    {sku.price === null ? (
                      <Badge tone="warning">Sem preço de venda</Badge>
                    ) : (
                      formatCurrency(Number(sku.price))
                    )}
                  </td>
                  <td>
                    <Badge tone={sku.stock_current > 0 ? "success" : "danger"}>{sku.stock_current}</Badge>
                  </td>
                  <td>
                    {canManageCatalog ? (
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => openEditSku(sku)}>
                          Editar
                        </Button>
                        <Button variant="ghost" onClick={() => deleteSku(sku.id)}>
                          Excluir
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-steel">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Modal open={importOpen} onClose={() => setImportOpen(false)}>
        <div className="space-y-4">
          <div>
            <p className="text-xs uppercase text-steel">Importar planilha</p>
            <p className="text-2xl font-semibold">
              {importMode === "multi" ? "Suppliers → Products → SKUs → Movements" : "Produtos (PT-BR)"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { key: "multi", label: "Multi-abas (padrão)" },
              { key: "produtos_pt", label: "Somente Produtos (PT-BR)" },
            ].map((mode) => (
              <button
                key={mode.key}
                onClick={() => {
                  setImportMode(mode.key as typeof importMode);
                  setImportPreview(null);
                  setImportPtPreview(null);
                  setImportSummary(null);
                  setImportState((prev) => ({ ...prev, status: "idle", message: "" }));
                }}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  importMode === mode.key ? "bg-ink text-white" : "bg-black/5 text-ink"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
          <div className="rounded-2xl border-2 border-dashed border-black/10 p-8 text-center">
            <p className="text-sm text-steel">Selecione um arquivo CSV ou XLSX</p>
              <Input
                type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setImportState((prev) => ({ ...prev, file }));
                  if (file) handleImportPreview(file);
              }}
              disabled={!canManageCatalog}
            />
          </div>
          {importMode === "multi" && importPreview && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3">
                <Badge tone="neutral">Fornecedores: {importPreview.suppliers.length}</Badge>
                <Badge tone="neutral">Produtos: {importPreview.products.length}</Badge>
                <Badge tone="neutral">SKUs: {importPreview.skus.length}</Badge>
                <Badge tone="neutral">Movimentos: {importPreview.movements.length}</Badge>
              </div>
              {importPreview.errors.length > 0 && (
                <div className="rounded-xl bg-ember/10 p-3 text-sm text-ember">
                  {importPreview.errors.slice(0, 6).map((error) => (
                    <p key={error}>{error}</p>
                  ))}
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <p className="text-xs uppercase text-steel">Preview Produtos</p>
                  <div className="text-xs text-steel">
                    {importPreview.products.slice(0, 3).map((row) => (
                      <p key={row.code}>
                        {row.code} • {row.name}
                      </p>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase text-steel">Preview SKUs</p>
                  <div className="text-xs text-steel">
                    {importPreview.skus.slice(0, 3).map((row) => (
                      <p key={row.sku}>
                        {row.sku} • {row.color}/{row.size}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          {importMode === "produtos_pt" && importPtPreview && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3">
                <Badge tone="neutral">Itens: {importPtPreview.rows.length}</Badge>
                <Badge tone={importPtPreview.errorCount ? "warning" : "neutral"}>
                  Erros: {importPtPreview.errorCount}
                </Badge>
                <Badge tone={importPtPreview.duplicates.length ? "warning" : "neutral"}>
                  Duplicados: {importPtPreview.duplicates.length}
                </Badge>
                <Badge tone={importPtPreview.supplierMissing.length ? "warning" : "neutral"}>
                  Fornecedor não encontrado: {importPtPreview.supplierMissing.length}
                </Badge>
              </div>
              {importPtPreview.errors.length > 0 && (
                <div className="rounded-xl bg-ember/10 p-3 text-sm text-ember">
                  {importPtPreview.errors.slice(0, 6).map((error) => (
                    <p key={error}>{error}</p>
                  ))}
                </div>
              )}
              {importPtPreview.duplicates.length > 0 && (
                <div className="rounded-xl bg-black/5 p-3 text-xs text-steel">
                  Duplicados no arquivo: {importPtPreview.duplicates.slice(0, 8).join(", ")}
                </div>
              )}
              {importPtPreview.supplierMissing.length > 0 && (
                <div className="rounded-xl bg-black/5 p-3 text-xs text-steel">
                  Fornecedores ausentes: {importPtPreview.supplierMissing.slice(0, 8).join(", ")}
                </div>
              )}
            </div>
          )}
          <div className="space-y-2">
            <div className="h-2 w-full rounded-full bg-black/5">
              <div className="h-2 rounded-full bg-ink transition" style={{ width: `${importState.progress}%` }} />
            </div>
            <p className="text-xs text-steel">{importState.message || "Aguardando arquivo"}</p>
          </div>
          {importSummary && <p className="text-xs text-steel">{importSummary}</p>}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Fechar
            </Button>
            <Button
              onClick={handleImportConfirm}
              disabled={
                (!importPreview && !importPtPreview) ||
                importState.status === "running" ||
                !canManageCatalog ||
                (importMode === "multi" && !!importPreview?.errors.length) ||
                (importMode === "produtos_pt" && !!importPtPreview?.errors.length)
              }
            >
              {importState.status === "running" ? "Importando..." : "Confirmar importação"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={productModalOpen} onClose={() => setProductModalOpen(false)}>
        <div className="space-y-4">
          <p className="text-2xl font-semibold">{productForm.id ? "Editar produto" : "Novo produto"}</p>
          <div className="flex items-center gap-4">
            {productImageUrl ? (
              <img
                src={productImageUrl}
                alt="Preview do produto"
                className="h-16 w-16 rounded-2xl object-cover cursor-pointer"
                onClick={() => setImageModal(productImageUrl)}
              />
            ) : (
              <div className="h-16 w-16 rounded-2xl bg-black/5" />
            )}
            <div className="flex-1">
              <label className="text-xs uppercase text-steel">Imagem (PNG/JPG/WEBP)</label>
              <Input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={!canWriteMedia}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  if (!file) {
                    setImageFile(null);
                    return;
                  }
                  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
                    setActionError("Formato inválido. Use PNG, JPG ou WEBP.");
                    setImageFile(null);
                    return;
                  }
                  setImageFile(file);
                }}
              />
              <p className="text-xs text-steel">Clique na imagem para ampliar.</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs uppercase text-steel">Código</label>
              <Input value={productForm.code} onChange={(event) => setProductForm({ ...productForm, code: event.target.value })} />
            </div>
            <div>
              <label className="text-xs uppercase text-steel">Nome</label>
              <Input value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} />
            </div>
            <div>
              <label className="text-xs uppercase text-steel">Categoria</label>
              <Input value={productForm.category} onChange={(event) => setProductForm({ ...productForm, category: event.target.value })} />
            </div>
            <div>
              <label className="text-xs uppercase text-steel">Fornecedor</label>
              <select className="input" value={productForm.supplier_id} onChange={(event) => setProductForm({ ...productForm, supplier_id: event.target.value })}>
                <option value="">Selecione</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs uppercase text-steel">Descrição</label>
            <Input value={productForm.description} onChange={(event) => setProductForm({ ...productForm, description: event.target.value })} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs uppercase text-steel">Coleção</label>
              <Input value={productForm.collection} onChange={(event) => setProductForm({ ...productForm, collection: event.target.value })} />
            </div>
            <div>
              <label className="text-xs uppercase text-steel">Status</label>
              <select className="input" value={productForm.status} onChange={(event) => setProductForm({ ...productForm, status: event.target.value })}>
                <option value="ATIVO">ATIVO</option>
                <option value="INATIVO">INATIVO</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setProductModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveProduct} disabled={!canManageCatalog}>
              Salvar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={skuModalOpen} onClose={() => setSkuModalOpen(false)}>
        <div className="space-y-4">
          <p className="text-2xl font-semibold">{skuForm.id ? "Editar SKU" : "Novo SKU"}</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs uppercase text-steel">Produto</label>
              <select className="input" value={skuForm.product_id} onChange={(event) => setSkuForm({ ...skuForm, product_id: event.target.value })}>
                <option value="">Selecione</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.code} - {product.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase text-steel">SKU</label>
              <Input value={skuForm.sku} onChange={(event) => setSkuForm({ ...skuForm, sku: event.target.value })} />
            </div>
            <div>
              <label className="text-xs uppercase text-steel">Cor</label>
              <Input value={skuForm.color} onChange={(event) => setSkuForm({ ...skuForm, color: event.target.value })} />
            </div>
            <div>
              <label className="text-xs uppercase text-steel">Tamanho</label>
              <Input value={skuForm.size} onChange={(event) => setSkuForm({ ...skuForm, size: event.target.value })} />
            </div>
            <div>
              <label className="text-xs uppercase text-steel">Custo</label>
              <Input value={skuForm.cost} onChange={(event) => setSkuForm({ ...skuForm, cost: event.target.value })} />
            </div>
            <div>
              <label className="text-xs uppercase text-steel">Preço de venda</label>
              <Input value={skuForm.price} onChange={(event) => setSkuForm({ ...skuForm, price: event.target.value })} placeholder="Opcional" />
            </div>
            <div>
              <label className="text-xs uppercase text-steel">Estoque mínimo</label>
              <Input value={skuForm.stock_min} onChange={(event) => setSkuForm({ ...skuForm, stock_min: event.target.value })} />
            </div>
            <div>
              <label className="text-xs uppercase text-steel">Status</label>
              <select className="input" value={skuForm.status} onChange={(event) => setSkuForm({ ...skuForm, status: event.target.value })}>
                <option value="ATIVO">ATIVO</option>
                <option value="INATIVO">INATIVO</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setSkuModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveSku} disabled={!canManageCatalog}>
              Salvar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!imageModal} onClose={() => setImageModal(null)}>
        <div className="flex justify-center">
          {imageModal && <img src={imageModal} alt="Produto" className="max-h-[60vh] rounded-2xl" />}
        </div>
      </Modal>
    </AppShell>
  );
}
