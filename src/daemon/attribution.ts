import * as path from "path";
import type { AILogEvent } from "../core/events";
import { getIncomingAdapter } from "../adapters/registry";
import type { AgentEventPayload } from "../adapters/registry";

const HOOK_MATCH_WINDOW_MS = 15000;
const AGENT_ACTIVE_WINDOW_MS = 60000;
const RING_SIZE = 512;

// Confidence ladder for inferred events: a hook matched a recent file
// target (0.85) > an agent is recently active (0.5) > nothing known (0.25).
const CONFIDENCE = {
  HOOK_MATCH: 0.85,
  ACTIVE_AGENT: 0.5,
  UNKNOWN: 0.25,
} as const;

interface HookFingerprint {
  time: number;
  actor: string;
  target: string;
}

/**
 * Attribution is about honesty. Events observed through agent hooks are
 * attributed with high confidence; filesystem/process events are correlated
 * against recent direct observations and always carry an explicit confidence.
 */
export class AttributionEngine {
  private recentHooks: HookFingerprint[] = [];
  private agentsActive = new Map<string, number>();

  fromHookPayload(payload: AgentEventPayload, sessionId: string | null, repoDir: string): AILogEvent | null {
    const adapter = getIncomingAdapter(payload.agent);
    if (!adapter) return null;
    const event = adapter.normalize(payload.payload);
    if (!event) return null;
    this.recordHook(event);
    return this.attach(event, sessionId, repoDir);
  }

  attach(event: AILogEvent, sessionId: string | null, repoDir: string): AILogEvent {
    const e = { ...event };
    if (sessionId) e.sessionId = sessionId;
    if (!e.repository) e.repository = repoDir;
    if (e.target) e.target = this.relativize(e.target, repoDir);

    if (e.metadata?.inferred === true) {
      this.markAgentActive(e);
      return e;
    }

    if (e.source === "agent-adapter" || e.observed) {
      this.recordHook(e);
      this.markAgentActive(e);
      return e;
    }

    if (e.source === "filesystem" || e.category === "filesystem") {
      return this.attributeFilesystem(e);
    }

    if (e.source === "process") {
      this.markAgentActive(e);
      return e;
    }

    return e;
  }

  private attributeFilesystem(e: AILogEvent): AILogEvent {
    if (!e.target) return { ...e, actor: "unknown", confidence: CONFIDENCE.UNKNOWN, observed: false };
    const now = Date.parse(e.timestamp) || Date.now();

    const match = this.recentHooks.find((h) => h.target === e.target && h.actor !== "system" && now - h.time <= HOOK_MATCH_WINDOW_MS);
    if (match) {
      return { ...e, actor: match.actor as AILogEvent["actor"], confidence: CONFIDENCE.HOOK_MATCH, observed: false };
    }

    let active: { agent: string; time: number } | null = null;
    for (const [agent, time] of this.agentsActive) {
      if (now - time <= AGENT_ACTIVE_WINDOW_MS && (!active || time > active.time)) {
        active = { agent, time };
      }
    }
    if (active) {
      return { ...e, actor: active.agent as AILogEvent["actor"], confidence: CONFIDENCE.ACTIVE_AGENT, observed: false };
    }

    return { ...e, actor: "unknown", confidence: CONFIDENCE.UNKNOWN, observed: false };
  }

  private recordHook(e: AILogEvent): void {
    if (!e.target) return;
    this.recentHooks.push({ time: Date.parse(e.timestamp) || Date.now(), actor: e.actor, target: e.target });
    if (this.recentHooks.length > RING_SIZE) {
      this.recentHooks.splice(0, this.recentHooks.length - RING_SIZE);
    }
  }

  private markAgentActive(e: AILogEvent): void {
    const agent = e.actor;
    if (agent === "human" || agent === "system" || agent === "unknown") return;
    this.agentsActive.set(agent, Date.parse(e.timestamp) || Date.now());
  }

  private relativize(target: string, repoDir: string): string {
    if (!target || !path.isAbsolute(target)) return target;
    const rel = path.relative(repoDir, target);
    if (!rel || rel.startsWith("..")) return target;
    return rel;
  }
}