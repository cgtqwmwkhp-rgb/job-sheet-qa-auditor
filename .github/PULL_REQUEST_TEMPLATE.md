## Summary

<!-- Provide a concise summary of the change. What is the problem? What is the solution? -->

## Changes

<!-- Bulleted list of changes. Be specific and clear. -->

## Files Changed

<!-- List the files changed in this PR -->

## Testing

<!-- How was this change tested? Provide commands and expected outputs. -->

> **No simulated evidence:** All test outputs must be real (actual command outputs, not placeholders).

### Commands Run

```bash
# Example:
pnpm check
pnpm test
```

### Actual Output

```
# Paste actual output here
```

## Checklist

### Author

- [ ] `pnpm check` passes
- [ ] `pnpm test` passes (all tests)
- [ ] `pnpm build` passes
- [ ] New tests added for new features/fixes
- [ ] Documentation updated for any user-facing changes
- [ ] No secrets or PII in code or logs

### Governance

- [ ] **Logging Discipline:** No `console.log` in server runtime code (use `safeLogger`)
- [ ] **No Simulated Evidence:** All test outputs are real, not placeholders
- [ ] **Contract Tests:** API changes include contract test updates

### Reviewer

- [ ] Code is clear, concise, and maintainable
- [ ] Logic is sound and meets requirements
- [ ] Tests are sufficient and cover edge cases
- [ ] No secrets or PII are logged or exposed
