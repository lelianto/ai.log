import { newEvent, type AILogEvent } from "../core/events";

const TEST_COMMAND_RE = /(^|\s)(npm(\s+(test|run\s+test|run\s+test:\w+))|npx\s+(\w+-test|jest|vitest|mocha|ava|tap|playwright|cypress)|pnpm(\s+(test|run\s+test))|yarn(\s+(test|run\s+test))|bun(\s+(test|run\s+test))|jest|vitest|mocha|pytest|go\s+test|cargo\s+test|gradle\s+test|mvn\s+test|ctest|tox|nosetests|pytest)(\s|$)/i;

/**
 * Derives failure events from observable signals: non-zero exit codes on
 * command events. Never inspects command output text.
 */
export class FailureDetector {
  onEvent(event: AILogEvent): AILogEvent[] {
    const out: AILogEvent[] = [];
    if (event.category !== "command") return out;

    const exit = typeof event.metadata?.exitCode === "number" ? (event.metadata.exitCode as number) : undefined;
    if (exit === undefined) return out;

    // Adapters already emit action "fail" for failed commands; deriving a
    // second fail event here would duplicate it (previously only suppressed
    // by the pipeline's dedupe window).
    if (event.action === "fail") return out;

    if (exit === 0) {
      if (TEST_COMMAND_RE.test(event.target ?? "")) {
        out.push(
          newEvent({
            sessionId: event.sessionId,
            repository: event.repository,
            actor: event.actor,
            category: "test",
            action: "pass",
            source: event.source,
            target: event.target,
            confidence: event.confidence,
            observed: event.observed,
            metadata: { exitCode: exit },
          })
        );
      }
      return out;
    }

    const isTest = TEST_COMMAND_RE.test(event.target ?? "");
    out.push(
      newEvent({
        sessionId: event.sessionId,
        repository: event.repository,
        actor: event.actor,
        category: isTest ? "test" : "command",
        action: "fail",
        source: event.source,
        target: event.target,
        confidence: event.confidence,
        observed: event.observed,
        metadata: { exitCode: exit, failed: true },
      })
    );
    return out;
  }
}