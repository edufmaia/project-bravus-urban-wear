import { cn } from "../../lib/utils";

export function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6">
      <div className="absolute inset-0" onClick={onClose} />
      <div className={cn("relative z-10 w-full max-w-3xl rounded-3xl bg-white p-8 shadow-soft")}>{children}</div>
    </div>
  );
}
