import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { LabelSheet } from "../components/labels/LabelSheet";
import {
  expandLabels,
  isLabelPrintPayload,
  LABEL_PRINT_STORAGE_PREFIX,
  sanitizePayload,
} from "../lib/labels";

type ParsedPrintData = {
  error: string | null;
  payload: ReturnType<typeof sanitizePayload> | null;
};

export function LabelsPrint() {
  const [searchParams] = useSearchParams();
  const jobId = searchParams.get("job_id");
  const autoPrint = searchParams.get("autoprint") === "1";

  const parsedData = useMemo<ParsedPrintData>(() => {
    if (!jobId) {
      return {
        error: "Parametro job_id ausente.",
        payload: null,
      };
    }

    const storageKey = `${LABEL_PRINT_STORAGE_PREFIX}${jobId}`;
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return {
        error: "Payload de impressao nao encontrado no navegador.",
        payload: null,
      };
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isLabelPrintPayload(parsed)) {
        return {
          error: "Payload invalido para impressao.",
          payload: null,
        };
      }
      return {
        error: null,
        payload: sanitizePayload(parsed),
      };
    } catch {
      return {
        error: "Falha ao ler payload de impressao.",
        payload: null,
      };
    }
  }, [jobId]);

  useEffect(() => {
    if (!autoPrint || !parsedData.payload) return;
    const timeout = setTimeout(() => {
      window.print();
    }, 250);
    return () => {
      clearTimeout(timeout);
    };
  }, [autoPrint, parsedData.payload]);

  const expandedLabels = useMemo(() => {
    if (!parsedData.payload) return [];
    return expandLabels(parsedData.payload.items);
  }, [parsedData.payload]);

  if (parsedData.error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8 text-center">
        <div>
          <p className="text-xl font-semibold">Nao foi possivel imprimir</p>
          <p className="mt-2 text-sm text-steel">{parsedData.error}</p>
        </div>
      </div>
    );
  }

  if (!parsedData.payload) {
    return (
      <div className="p-6 text-sm text-steel">
        Preparando etiquetas...
      </div>
    );
  }

  return (
    <>
      <style>
        {`
          @page {
            size: A4;
            margin: 0;
          }
          body {
            margin: 0;
            background: #fff !important;
          }
        `}
      </style>
      <LabelSheet templateId={parsedData.payload.template_id} labels={expandedLabels} />
    </>
  );
}
