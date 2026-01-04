# Contributing to Job Sheet QA Auditor

Thank you for your interest in contributing to Job Sheet QA Auditor! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Branch Naming](#branch-naming)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Code Standards](#code-standards)
- [Testing Requirements](#testing-requirements)
- [Documentation](#documentation)

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment. Be kind, be constructive, and focus on the work.

## Getting Started

### Prerequisites

- Node.js 22.x
- pnpm 10.x
- Git

### Local Setup

```bash
# Clone the repository
git clone https://github.com/cgtqwmwkhp-rgb/job-sheet-qa-auditor.git
cd job-sheet-qa-auditor

# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env

# Start development server
pnpm dev
```

### Running Tests

```bash
# Unit tests
pnpm test

# E2E tests
pnpm test:e2e

# Type check
pnpm check

# Lint
pnpm lint
```

## Development Workflow

1. **Create a branch** from `main` using the naming convention below
2. **Make changes** following code standards
3. **Write tests** for new functionality
4. **Run all checks** locally before pushing
5. **Create a PR** targeting `main`
6. **Address review feedback**
7. **Merge** after approval and CI passes

## Branch Naming

Use the following branch naming patterns (CI triggers on these):

| Pattern | Purpose | Example |
|---------|---------|---------|
| `feature/*` | New features | `feature/add-export-button` |
| `fix/*` | Bug fixes | `fix/validation-error` |
| `hotfix/*` | Urgent production fixes | `hotfix/security-patch` |
| `release/*` | Release preparation | `release/v1.2.0` |
| `stage-*` | Staged milestones | `stage-1.3-governance` |

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, semicolons, etc.)
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```
feat(validation): add support for multi-page PDFs

fix(auth): resolve token refresh race condition

docs(readme): update installation instructions

test(api): add integration tests for document upload
```

## Pull Request Process

### Before Creating a PR

1. Ensure all tests pass locally
2. Run type check: `pnpm check`
3. Run linter: `pnpm lint`
4. Update documentation if needed

### PR Requirements

- **Title**: Use conventional commit format
- **Description**: Explain what and why
- **Tests**: Include tests for new functionality
- **Documentation**: Update relevant docs

### CI Checks (Required)

All PRs must pass:

- ✅ Lint Check
- ✅ TypeScript Check
- ✅ Unit & Integration Tests
- ✅ E2E Tests (Functional)
- ✅ Policy Check
- ✅ Release Rehearsal (for main)

### Review Process

1. At least one approval required
2. All CI checks must pass
3. No unresolved conversations
4. Branch must be up to date with main

## Code Standards

### TypeScript

- Use strict mode
- Prefer explicit types over `any`
- Use interfaces for object shapes
- Document public APIs with JSDoc

### React

- Use functional components with hooks
- Follow React best practices
- Avoid inline styles (use Tailwind)

### File Organization

```
server/           # Backend code
  services/       # Business logic
  routes/         # API routes
  utils/          # Utilities
client/           # Frontend code
  src/
    components/   # React components
    pages/        # Page components
    hooks/        # Custom hooks
    utils/        # Utilities
```

## Testing Requirements

### Unit Tests

- Test business logic in isolation
- Mock external dependencies
- Aim for meaningful coverage, not 100%

### Integration Tests

- Test API endpoints
- Test database operations
- Use test fixtures

### E2E Tests

- Test critical user flows
- Keep tests stable and deterministic
- Avoid visual regression in blocking CI

## Documentation

### When to Document

- New features
- API changes
- Configuration options
- Architecture decisions (ADRs)

### Where to Document

- `README.md`: Project overview, setup
- `docs/`: Detailed documentation
- `docs/adr/`: Architecture Decision Records
- Code comments: Complex logic explanation

## Questions?

If you have questions about contributing:

1. Check existing documentation
2. Search closed issues/PRs
3. Open a discussion or issue

Thank you for contributing! 🎉
