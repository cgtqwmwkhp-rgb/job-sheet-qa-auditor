## Description

<!--
- What is the purpose of this PR?
- What is the business context?
- What is the technical context?
- What is the impact of this change?
-->

## Checklist

### General

- [ ] Title is descriptive and follows [Conventional Commits](https://www.conventionalcommits.org/)
- [ ] I have read and understood the [contributing guidelines](CONTRIBUTING.md)
- [ ] This PR is based on the latest `main` branch
- [ ] This PR is linked to the relevant issue(s)

### Code Quality

- [ ] The code is well-documented and easy to understand
- [ ] The code follows the project's coding style
- [ ] The code is covered by tests
- [ ] All tests pass
- [ ] The code is free of security vulnerabilities

### Release Hardening

- [ ] **No Simulated Evidence**: All verification evidence is from a live environment (local or deployed)
- [ ] **Deployed SHA Verified**: The deployed SHA is captured and verified, not assumed from `github.sha`
- [ ] **Strict Mode for Production**: Production verification uses `strict` mode
- [ ] **Missing Evidence Handled**: Scripts and workflows fail gracefully with `MISSING_EVIDENCE` markers

### Documentation

- [ ] The documentation has been updated to reflect the changes
- [ ] The CHANGELOG has been updated

### Deployment

- [ ] The changes have been tested in a staging environment
- [ ] The changes are backward compatible
- [ ] The changes do not introduce any breaking changes

## Screenshots

<!-- Add screenshots here if applicable -->

## Additional Notes

<!-- Add any additional notes here -->
