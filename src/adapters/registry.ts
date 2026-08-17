import type { Adapter, HookPayload } from "./types";
import type { Agent } from "../core/constants";
import { normalizeClaude } from "./claude";
import { normalizeCodex } from "./codex";
import { normalizeGemini } from "./gemini";
import { normalizeOpenCode } from "./opencode";

export type AgentEventPayload = { agent: Agent; payload: HookPayload };

const ADAPTERS: Record<Agent, Adapter> = {
  claude: { name: "claude", normalize: normalizeClaude },
  codex: { name: "codex", normalize: normalizeCodex },
  gemini: { name: "gemini", normalize: normalizeGemini },
  opencode: { name: "opencode", normalize: normalizeOpenCode },
};

export function getIncomingAdapter(agent: Agent): Adapter | undefined {
  return ADAPTERS[agent];
}

export function allAdapters(): Adapter[] {
  return Object.values(ADAPTERS);
}