/**
 * Interpreter module barrel — LIVE / production-safe surface only.
 *
 * The simulated InterpreterRouter (random confidence) is QUARANTINED:
 * it is NOT re-exported here so production quality paths cannot import
 * it via this barrel. Import router.ts only from contract/unit tests.
 *
 * Live providers: use server/services/interpreterAdapter/
 */

export * from "./types";
// QUARANTINED — do not re-export './router' (simulated confidence, test-only)
