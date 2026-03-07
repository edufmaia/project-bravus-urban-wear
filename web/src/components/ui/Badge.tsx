import { cn } from "../../lib/utils";

export function Badge({ className, tone = "neutral", ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "success" | "warning" | "danger" }) {
  const tones = {
    neutral: "bg-black/5 text-ink",
    success: "bg-lime/60 text-ink",
    warning: "bg-amber-200 text-amber-900",
    danger: "bg-ember/20 text-ember",
  };
  return <span className={cn("badge", tones[tone], className)} {...props} />;
}
