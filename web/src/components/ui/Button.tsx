import { cn } from "../../lib/utils";

export function Button({
  className,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "ghost" }) {
  const variantClass =
    variant === "primary" ? "btn btn-primary" : variant === "outline" ? "btn btn-outline" : "btn hover:bg-black/5";
  return <button className={cn(variantClass, className)} {...props} />;
}
