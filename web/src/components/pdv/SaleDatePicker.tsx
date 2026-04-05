type Props = {
  value: string | null;
  onChange: (date: string) => void;
};

const formatWeekday = (isoDate: string) => {
  try {
    const [year, month, day] = isoDate.split("-").map(Number);
    const d = new Date(year, month - 1, day);
    const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(d);
    const formatted = new Intl.DateTimeFormat("pt-BR").format(d);
    return `${formatted} — ${weekday}`;
  } catch {
    return "";
  }
};

export function SaleDatePicker({ value, onChange }: Props) {
  const today = new Date().toISOString().split("T")[0];
  const current = value || today;

  return (
    <div>
      <label className="text-xs uppercase text-steel">Data da venda</label>
      <input
        type="date"
        className="input"
        value={current}
        onChange={(e) => onChange(e.target.value)}
      />
      {current && (
        <p className="mt-1 text-xs text-steel">{formatWeekday(current)}</p>
      )}
    </div>
  );
}
