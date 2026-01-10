type RelativeUnit = {
  label: string;
  seconds: number;
};

const UNITS: RelativeUnit[] = [
  { label: "yr", seconds: 365 * 24 * 60 * 60 },
  { label: "mo", seconds: 30 * 24 * 60 * 60 },
  { label: "wk", seconds: 7 * 24 * 60 * 60 },
  { label: "day", seconds: 24 * 60 * 60 },
  { label: "hr", seconds: 60 * 60 },
  { label: "min", seconds: 60 },
];

export function formatRelativeTime(isoString: string, now: Date = new Date()): string {
  const value = new Date(isoString);
  if (Number.isNaN(value.getTime())) {
    return "";
  }
  const diffSeconds = Math.max(0, Math.floor((now.getTime() - value.getTime()) / 1000));
  if (diffSeconds < 45) {
    return "just now";
  }
  for (const unit of UNITS) {
    if (diffSeconds >= unit.seconds) {
      const amount = Math.floor(diffSeconds / unit.seconds);
      const label = amount === 1 ? unit.label : `${unit.label}s`;
      return `${amount} ${label}`;
    }
  }
  return "just now";
}
