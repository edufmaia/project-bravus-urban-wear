import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export function BarcodeSvg({
  value,
  height = 22,
}: {
  value: string;
  height?: number;
}) {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    JsBarcode(ref.current, value, {
      format: "CODE128",
      displayValue: false,
      height,
      width: 1.1,
      margin: 0,
      background: "transparent",
    });
  }, [value, height]);

  return <svg ref={ref} className="h-full w-full" />;
}
