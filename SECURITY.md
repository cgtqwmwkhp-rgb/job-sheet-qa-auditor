# Security Policy

## Supported Versions

The following versions of Job Sheet QA Auditor are currently supported with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly.

### How to Report

1. **Do NOT** create a public GitHub issue for security vulnerabilities.

2. **Email** the security team at: security@example.com (or create a private security advisory on GitHub)

3. **Include** the following information:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

### What to Expect

- **Acknowledgment**: We will acknowledge receipt within 48 hours.
- **Assessment**: We will assess the vulnerability within 5 business days.
- **Resolution**: We aim to resolve critical vulnerabilities within 30 days.
- **Disclosure**: We will coordinate disclosure timing with you.

### Security Best Practices

When using this application:

1. **Environment Variables**: Never commit secrets to the repository. Use `.env` files locally and secure secret management in production.

2. **API Keys**: Rotate API keys regularly and use the minimum required permissions.

3. **Authentication**: Always use HTTPS in production. OAuth tokens should be stored securely.

4. **File Uploads**: The application validates file types and sizes. Do not disable these checks.

5. **Database**: Use parameterized queries (handled by Drizzle ORM). Never construct SQL from user input.

## Security Features

This application includes the following security measures:

### Input Validation
- File type validation (PDF only for document uploads)
- File size limits
- Input sanitization

### Authentication & Authorization
- OAuth-based authentication
- Role-based access control (RBAC)
- Session management with secure cookies

### Data Protection
- PII redaction in logs
- Audit logging for sensitive operations
- Encrypted data at rest (database-level)

### CI/CD Security
- No secrets in repository
- Dependency scanning
- SAST (Static Application Security Testing)
- Secret scanning

## Threat Model

Key threats addressed:

| Threat | Mitigation |
|--------|------------|
| Upload abuse | File type/size validation, rate limiting |
| PII leakage | Automatic redaction, access controls |
| Prompt injection | Input sanitization, output validation |
| Auth bypass | OAuth with proper token validation |
| Data exfiltration | Audit logging, access controls |

## Security Updates

Security updates are released as patch versions. We recommend:

1. Subscribe to release notifications
2. Update promptly when security patches are released
3. Review the CHANGELOG for security-related changes

## Compliance

This application is designed to support compliance with:

- Data protection regulations (GDPR principles)
- Audit trail requirements
- Access control requirements

For specific compliance questions, please contact the maintainers.
