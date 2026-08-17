const PLACEHOLDER = "[REDACTED]";

const SENSITIVE_KEY = /(?:token|secret|password|passwd|pass|api[_-]?key|access[_-]?key|client[_-]?secret|auth|credential|aws[_-]?secret[_-]?access[_-]?key|private[_-]?key)/i;

const FLAG_PATTERN = new RegExp(`--([\\w-]*${SENSITIVE_KEY.source}[\\w-]*)(\\s*=\\s*|\\s+)(\\S+)`, "gi");
const ASSIGN_PATTERN = new RegExp(`\\b([\\w]*${SENSITIVE_KEY.source}[0-9_]*\\b)\\s*=\\s*([^&\\s"']+|"[^"]*"|'[^']*')`, "gi");
const HEADER_PATTERN = new RegExp(`\\b([\\w-]*${SENSITIVE_KEY.source}[\\w-]*)\\s*:\\s*([^\\s"',&]+)`, "gi");

/**
 * Masks likely secret values inside a shell command before it is stored.
 * Applies to key-based flags, env-style assignments, auth headers, and
 * secret query parameters. The command shape is preserved.
 * Note: placeholders never contain the original value, so repeated runs are idempotent.
 */
export function redactCommand(value: string): string {
  if (!value) return value;
  let out = value;

  out = out.replace(FLAG_PATTERN, (m, flag, sep) => {
    void m;
    return `--${flag}${sep}${PLACEHOLDER}`;
  });

  out = out.replace(ASSIGN_PATTERN, (m, key) => {
    void m;
    return `${key}=${PLACEHOLDER}`;
  });

  out = out.replace(/\b(Bearer|Basic|Token)\s+([A-Za-z0-9._~+/=-]{8,})\b/gi, `$1 ${PLACEHOLDER}`);

  out = out.replace(HEADER_PATTERN, (m, name, value) => {
    if (/^(Bearer|Basic|Token)$/i.test(value) || value.includes(PLACEHOLDER)) return m;
    return `${name}: ${PLACEHOLDER}`;
  });

  out = out.replace(/([?&](?:key|token|secret|sig|password|access_token|api_key)=)[^&"'\s]+/gi, `$1${PLACEHOLDER}`);

  return out;
}

export function hasRedaction(value: string): boolean {
  return value.includes(PLACEHOLDER);
}