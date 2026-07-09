# Template Collision Governance

PR-16 establishes mandatory fingerprint collision checks before template activation.

## Why

An ambiguous template match validates against the wrong specification — a silent wrong-audit generator. Selection traces and ambiguity analytics already existed; activation lacked a blocking collision gate.

## Fingerprint

A template fingerprint is derived from `selectionConfigJson`:

- `requiredTokensAll` (normalized, sorted)
- `requiredTokensAny` (included in Jaccard universe)
- `formCodeRegex` (identical patterns are an exact collision)

## Severities

| Severity | Rule                                                                                 | Activation |
| -------- | ------------------------------------------------------------------------------------ | ---------- |
| exact    | Identical `requiredTokensAll` or identical `formCodeRegex`                           | Block      |
| high     | Jaccard ≥ 0.7 on required token universe, or one required set is a subset of another | Block      |
| moderate | Jaccard ≥ 0.4                                                                        | Warn only  |

## Enforcement points

1. `activateVersion()` — blocks unless `skipCollisionCheck` / precondition skip (tests only)
2. `runPolicyCheck()` / `generateActivationReport()` — when `existingFingerprints` provided
3. Analytics: `analytics.getTemplateCollisionReport` / `checkTemplateCollision`

## Remediation

Differentiate `requiredTokensAll` / `requiredTokensAny`, or add a unique `formCodeRegex`, then re-run the collision check.
