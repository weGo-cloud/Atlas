import type { IntelligenceContext } from "./context";
import type { Signal } from "./signal";

/**
 * Mission 021 — Section 4. A rule is a pure function: same context in,
 * same signal (or absence of one) out, every time. No rule reads the
 * clock, randomness, or anything outside its `context` argument — that
 * purity is what Section 15's "same analytics context must produce the
 * same intelligence result" test verifies, and what makes every rule
 * unit-testable with a hand-built fixture context instead of a real
 * database.
 *
 * `triggeredAt` is deliberately a parameter to `evaluate`, not read
 * internally via `new Date()` — the engine (not the rule) owns "now",
 * so every signal in one result shares exactly the same timestamp and
 * a rule can never introduce nondeterminism through the clock.
 */
export type Rule = {
  evaluate(context: IntelligenceContext, triggeredAt: string): Signal | null;
};

/**
 * Runs every rule against one context and returns whatever fired.
 * Order follows RULES's declaration order (see rules/index.ts) —
 * stable and irrelevant to correctness, since rules never depend on
 * each other's output.
 */
export function evaluateSignals(rules: readonly Rule[], context: IntelligenceContext, triggeredAt: string): Signal[] {
  const signals: Signal[] = [];
  for (const rule of rules) {
    const signal = rule.evaluate(context, triggeredAt);
    if (signal) signals.push(signal);
  }
  return signals;
}
