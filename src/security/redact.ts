export function redact(value: string): string {
  if (!value) return value;
  if (value.length <= 4) return "*".repeat(value.length);
  return value.slice(0, 2) + "*".repeat(Math.max(4, value.length - 4)) + value.slice(-2);
}