import type { AILogEvent } from "../core/events";
import { newEvent } from "../core/events";
import type { Risk } from "../core/constants";
import type { AILogConfig } from "../core/config";

export interface SecurityRule {
  id: string;
  name: string;
  pattern: RegExp;
  risk: Risk;
  reason: string;
}

const SENSITIVE_PATH_RULES: SecurityRule[] = [
  { id: "env-prod", name: "Sensitive environment file", pattern: /(^|\/)(\.env\.(prod|production|live))(\b|$)/i, risk: "high", reason: "Production environment file" },
  // .env.example / .env.local / .env.test / .env.dev are usually committed and safe to inspect
  { id: "env", name: "Environment file", pattern: /(^|\/)(\.env)(?!(\.(example|local|test|dev)))(\b|$)/i, risk: "medium", reason: "Sensitive environment file" },
  { id: "ssh", name: "SSH credentials", pattern: /(^|\/)\.ssh(\/|$)/, risk: "high", reason: "SSH credentials directory" },
  { id: "pem-key", name: "Private key or certificate", pattern: /\.(pem|key|p12|pfx|p8|p8\.pub|crt|cer|der)$/i, risk: "high", reason: "Private key or certificate file" },
  { id: "aws-creds", name: "Cloud credentials", pattern: /(^|\/)(\.aws)(\/|$)|aws[-_]credentials|google[-_]application[-_]credentials|gcloud[-_].*key/i, risk: "high", reason: "Cloud credentials" },
  { id: "credential-named", name: "Credentials", pattern: /(^|\/)[^/]*(credentials|secrets?|\.secret)(\.|$)/i, risk: "high", reason: "Credential or secret file" },
  { id: "token-named", name: "Tokens", pattern: /(^|\/)[^/]*(token|api[-_]?key|auth[-_]?key)(\.|$)/i, risk: "medium", reason: "Token or API key file" },
  { id: "prod-config", name: "Production configuration", pattern: /(production|prod)\.(json|yaml|yml|toml|conf|config|env)$/i, risk: "medium", reason: "Production configuration file" },
];

const DANGEROUS_COMMAND_PATTERNS: { id: string; name: string; pattern: RegExp; risk: Risk; reason: string }[] = [
  { id: "rm-rf", name: "Recursive force delete", pattern: /\brm\b\s+(?:-[a-z]*rf[a-z]*\b|--(?:recursive|force)\b)/i, risk: "high", reason: "Recursive force delete" },
  { id: "sudo", name: "Privilege escalation", pattern: /(^|[;&|]\s*)sudo\b/i, risk: "medium", reason: "Privilege escalation" },
  { id: "chmod", name: "File mode change", pattern: /\bchmod\b/i, risk: "medium", reason: "Changing file permissions" },
  { id: "chown", name: "File ownership change", pattern: /\bchown\b/i, risk: "medium", reason: "Changing file ownership" },
  { id: "git-reset-hard", name: "Hard git reset", pattern: /\bgit\s+reset\s+--hard\b/i, risk: "high", reason: "Destructive git reset" },
  { id: "git-clean-fd", name: "Force git clean", pattern: /\bgit\s+clean\s+(?:-[a-z]*fd[a-z]*|-f[^a-z]*)/i, risk: "high", reason: "Destructive git clean" },
  { id: "drop-db", name: "Destructive database operation", pattern: /\bDROP\s+(?:DATABASE|TABLE|SCHEMA)\b/i, risk: "critical", reason: "Destructive database operation" },
];

const NETWORK_COMMAND_PATTERNS: { id: string; name: string; pattern: RegExp; risk: Risk; reason: string }[] = [
  { id: "curl", name: "External network request", pattern: /(^|\s|\||;|&)curl\b/i, risk: "medium", reason: "External network request" },
  { id: "wget", name: "External network request", pattern: /(^|\s|\||;|&)wget\b/i, risk: "medium", reason: "External network request" },
  { id: "ssh", name: "Remote connection", pattern: /(^|\s|\||;|&)ssh\b/i, risk: "medium", reason: "Remote connection" },
  { id: "scp", name: "Remote file copy", pattern: /(^|\s|\||;|&)scp\b/i, risk: "medium", reason: "Remote file copy" },
  { id: "nc", name: "Network utility", pattern: /(^|\s|\||;|&)(nc|ncat|telnet|ftp)\b/i, risk: "medium", reason: "Network utility" },
];

export interface ScanResult {
  event: AILogEvent;
  rule: SecurityRule;
}

export class SecurityScanner {
  private config: AILogConfig;

  constructor(config: AILogConfig) {
    this.config = config;
  }

  /**
   * Deterministic rules only. Output never claims malicious intent - it flags
   * potentially sensitive activity and lets the developer decide.
   */
  scan(source: AILogEvent): AILogEvent[] {
    const out: AILogEvent[] = [];

    if (source.category === "filesystem" && this.config.security.detectSecrets) {
      for (const rule of SENSITIVE_PATH_RULES) {
        if (rule.pattern.test(source.target ?? "") || (typeof source.metadata?.oldPath === "string" && rule.pattern.test(source.metadata.oldPath as string))) {
          out.push(this.flag(source, rule));
          break;
        }
      }
    }

    if (source.category === "command" && this.config.security.detectDangerousCommands) {
      const cmd = source.target ?? "";
      for (const r of DANGEROUS_COMMAND_PATTERNS) {
        if (r.pattern.test(cmd)) {
          out.push(this.flag(source, { ...r }));
          break;
        }
      }
    }

    if (source.category === "command" && this.config.security.detectNetworkCommands) {
      const cmd = source.target ?? "";
      for (const r of NETWORK_COMMAND_PATTERNS) {
        if (r.pattern.test(cmd)) {
          out.push(this.flag(source, { ...r }));
          break;
        }
      }
    }

    return out;
  }

  private flag(source: AILogEvent, rule: SecurityRule): AILogEvent {
    return newEvent({
      sessionId: source.sessionId,
      repository: source.repository,
      actor: source.actor,
      category: "security",
      action: source.category === "command" ? "sensitive-command" : "sensitive-file-access",
      source: source.source,
      target: source.target,
      risk: rule.risk,
      confidence: Math.max(source.confidence, 0.5),
      observed: source.observed,
      metadata: { reason: rule.reason, rule: rule.id, matchedTarget: source.target },
    });
  }
}