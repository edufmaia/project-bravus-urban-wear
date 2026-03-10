import { BarcodeSvg } from "./BarcodeSvg";
import { type ExpandedLabel, getTemplateById, type LabelTemplateId } from "../../lib/labels";

export function LabelSheet({
  templateId,
  labels,
}: {
  templateId: LabelTemplateId;
  labels: ExpandedLabel[];
}) {
  const template = getTemplateById(templateId);

  return (
    <div
      style={{
        padding: `${template.pagePaddingMm}mm`,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${template.columns}, ${template.labelWidthMm}mm)`,
          gridAutoRows: `${template.labelHeightMm}mm`,
          gap: `${template.gapMm}mm`,
          justifyContent: "center",
        }}
      >
        {labels.map((label) => (
          <article
            key={`${label.sku_id}-${label.sequence}`}
            style={{
              width: `${template.labelWidthMm}mm`,
              height: `${template.labelHeightMm}mm`,
              border: "0.2mm solid #111",
              borderRadius: "1mm",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              padding: "1.6mm",
              overflow: "hidden",
              fontFamily: "Inter Tight, Inter, system-ui, sans-serif",
              color: "#111",
              background: "#fff",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "2mm" }}>
              <p
                style={{
                  margin: 0,
                  fontSize: "2.4mm",
                  fontWeight: 900,
                  letterSpacing: "0.14em",
                  lineHeight: 1,
                }}
              >
                BRAVUS
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: "1.9mm",
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  lineHeight: 1,
                }}
              >
                URBAN WEAR
              </p>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: "2mm" }}>
              <p
                style={{
                  margin: 0,
                  fontSize: "3.1mm",
                  fontWeight: 700,
                  lineHeight: 1.1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {label.product_name}
              </p>
              <p style={{ margin: 0, fontSize: "2.5mm", fontWeight: 700 }}>
                {label.product_code}
              </p>
            </div>

            <p
              style={{
                margin: 0,
                fontSize: "2.5mm",
                lineHeight: 1.1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {label.color}/{label.size}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.6mm" }}>
              <div style={{ height: "8mm" }}>
                <BarcodeSvg value={label.barcode_value} />
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: "1.8mm",
                  textAlign: "center",
                  letterSpacing: "0.04em",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {label.barcode_value}
              </p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
