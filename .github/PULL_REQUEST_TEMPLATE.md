## Summary

<!--
Provide a concise summary of the change.
What is the problem? What is the solution?
-->

## Changes

<!--
- Bulleted list of changes
- Be specific and clear
-->

## Files Changed

<!--
- `path/to/file.ts`
- `path/to/another/file.ts`
-->

## Benefits

<!--
- Why is this change beneficial?
- What problem does it solve?
-->

## Testing

<!--
- How was this change tested?
- Provide commands and expected outputs
-->

---

### Pre-Merge Checklist (Author)

- [ ] `pnpm check` passes
- [ ] `pnpm test` passes (all tests)
- [ ] `pnpm build` passes
- [ ] New tests added for new features/fixes
- [ ] Contract tests updated for any API changes
- [ ] Documentation updated for any user-facing changes

### Governance Checklist (Author)

- [ ] **Logging Discipline:** No `console.log` used in server runtime code (use `safeLogger`)
- [ ] **Version Endpoint:** `systemRouter.ts` changes are backward-compatible
- [ ] **OAuth Policy:** `sdk.ts` changes do not break production auth

### Pre-Merge Checklist (Reviewer)

- [ ] Code is clear, concise, and maintainable
- [ ] Logic is sound and meets requirements
- [ ] Tests are sufficient and cover edge cases
- [ ] No secrets or PII are logged or exposed
- [ ] Follows established coding style and conventions
