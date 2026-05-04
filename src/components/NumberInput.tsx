import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

function formatGroups(n: number): string {
  if (!Number.isFinite(n)) return "";
  return new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 }).format(Math.round(n));
}

function parseGroups(s: string): number {
  if (!s) return 0;
  // Tillad både dansk (1.234,56) og rå tal. Fjern alle ikke-tal/-/komma/punktum
  const cleaned = s.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Numerisk input med dansk tusindtalsseparator (1.234.567).
 * Værdien gemmes som rent tal; visning bruger grupper for at minimere tastefejl.
 */
export function NumberInput({
  value,
  onChange,
  className,
  step,
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  step?: number;
}) {
  const [text, setText] = useState(formatGroups(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(formatGroups(value));
  }, [value, focused]);

  return (
    <Input
      type="text"
      inputMode="numeric"
      value={text}
      step={step}
      className={className}
      onFocus={(e) => {
        setFocused(true);
        // Vis rå værdi uden grupper ved redigering for nemmere tastning
        setText(Number.isFinite(value) ? String(Math.round(value)) : "");
        requestAnimationFrame(() => e.target.select());
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const n = parseGroups(raw);
        if (Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => {
        setFocused(false);
        setText(formatGroups(value));
      }}
    />
  );
}
