const PLACEHOLDER = "[REDACTED]";

// Stems that mark a key name as sensitive. Matched against whole
// underscore/dash-separated segments, so "bypass", "compass", "tokenize"
// are NOT matched (the stem must be preceded/followed by a non-letter).
const SENSITIVE_KEY = /(?:token|secret|password|passwd|pass|api[_-]?key|access[_-]?key|client[_-]?secret|auth|credential|aws[_-]?secret[_-]?access[_-]?key|private[_-]?key)/i;

const FLAG_PATTERN = /--([\w-]+)(\s*=\s*|\s+)(\S+)/gi;
const ASSIGN_PATTERN = /([\w-]+)\s*=\s*([^&\s"']+|"[^"]*"|'[^']*')/gi;
const HEADER_PATTERN = /([\w-]+)\s*:\s*([^\s"',&]+)/gi;
const AUTH_HEADER_PATTERN = /\b(Bearer|Basic|Token)\s+([A-Za-z0-9._~+/=-]{8,})\b/gi;
const URL_PATTERN = /(https?:\/\/[^\s"'<>]+)/gi;

/**
 * True when a string (typically a flag/env/query key name) contains a
 * sensitive stem such as token, secret, password, api key, credential,
 * auth, etc. The stem must sit at a word boundary — "bypass=…" and
 * "python -m tokenize" are safe, while "MY_TOKEN=…", "api_key=…" and
 * "GITHUB_TOKEN=…" are redacted.
 */
export function isSensitiveKeyMatch(name: string): boolean {
  return new RegExp(`(?:^|[^a-z])(${SENSITIVE_KEY.source})(?=$|[^a-z])`, "i").test(name);
}

/**
 * Masks likely secret values in a free-form string. When `command` is true
 * the full command syntax is covered (key-based flags, env-style
 * assignments, auth headers); in both modes secret query parameters in URLs
 * are rewritten. The string shape is preserved and placeholders never
 * contain the original value, so repeated runs are idempotent.
 */
export function redactString(value: string, command: boolean): string {
  if (!value) return value;
  let out = value;

  if (command) {
    out = out.replace(FLAG_PATTERN, (m, flag: string, sep: string, val: string) => {
      if (!isSensitiveKeyMatch(flag) || val === PLACEHOLDER) return m;
      return `--${flag}${sep}${PLACEHOLDER}`;
    });

    out = out.replace(ASSIGN_PATTERN, (m, key: string, val: string) => {
      if (!isSensitiveKeyMatch(key) || val === PLACEHOLDER) return m;
      return `${key}=${PLACEHOLDER}`;
    });

    out = out.replace(AUTH_HEADER_PATTERN, `$1 ${PLACEHOLDER}`);

    out = out.replace(HEADER_PATTERN, (m, name: string, val: string) => {
      if (!isSensitiveKeyMatch(name) || /^(Bearer|Basic|Token)$/i.test(val) || val === PLACEHOLDER) return m;
      return `${name}: ${PLACEHOLDER}`;
    });
  }

  out = out.replace(URL_PATTERN, (url) => {
    const q = url.indexOf("?");
    if (q === -1) return url;
    const base = url.slice(0, q);
    const parts = url.slice(q + 1).split("&");
    let changed = false;
    const rewritten = parts.map((pair) => {
      const eq = pair.indexOf("=");
      if (eq === -1) return pair;
      const name = pair.slice(0, eq);
      if (isSensitiveKeyMatch(name)) {
        changed = true;
        return `${name}=${PLACEHOLDER}`;
      }
      return pair;
    });
    return changed ? `${base}?${rewritten.join("&")}` : url;
  });

  return out;
}

/**
 * Masks likely secret values inside a shell command before it is stored.
 * See {@link redactString}.
 */
export function redactCommand(value: string): string {
  return redactString(value, true);
}

export function hasRedaction(value: string): boolean {
  return value.includes(PLACEHOLDER);
}
