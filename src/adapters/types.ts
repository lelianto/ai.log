import type { Agent } from "../core/constants";
import type { AILogEvent } from "../core/events";

/**
 * A raw hook payload as received from an agent's hook system.
 * Fields vary per agent; adapters normalize them into AILogEvent.
 */
export type HookPayload = Record<string, unknown>;

export interface Adapter {
  name: Agent;
  normalize(payload: HookPayload, fallbackCwd?: string): AILogEvent | null;
}

export interface AdapterRegistry {
  get(agent: Agent): Adapter;
}