# Deployment Guide

## Job Sheet QA Auditor - Production Deployment

This guide provides step-by-step instructions for deploying the Job Sheet QA Auditor to production.

---

## Pre-Deployment Checklist

### 1. Environment Variables

Ensure all required environment variables are configured:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret key for JWT token signing |
| `MISTRAL_API_KEY` | Yes | Mistral OCR API key |
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `S3_BUCKET` | Yes | S3 bucket for file storage |
| `S3_REGION` | Yes | AWS region for S3 |
| `S3_ACCESS_KEY` | Yes | AWS access key |
| `S3_SECRET_KEY` | Yes | AWS secret key |

### 2. Database Migration

Run database migrations before deployment:

```bash
pnpm db:push
```

### 3. Build Verification

Ensure the build completes without errors:

```bash
pnpm build
```

### 4. Test Suite

All tests must pass:

```bash
pnpm test
```

---

## Deployment Steps

### Step 1: Create Production Build

```bash
pnpm build
```

### Step 2: Verify Build Output

Check the `dist/` directory for:
- `client/` - Static frontend assets
- `server/` - Compiled server code

### Step 3: Database Setup

1. Create PostgreSQL database
2. Run migrations: `pnpm db:push`
3. Verify tables created successfully

### Step 4: Configure Environment

Set all environment variables in your hosting platform.

### Step 5: Deploy

Using Manus built-in hosting:
1. Create a checkpoint: Click "Save Checkpoint"
2. Click "Publish" button in the Management UI
3. Configure custom domain if needed

---

## Post-Deployment Verification

### Health Checks

1. **API Health**: `GET /api/health`
2. **Database Connection**: Verify dashboard loads
3. **File Upload**: Test document upload
4. **OCR Processing**: Verify document processing works

### Smoke Tests

1. Login as Admin
2. Upload a test document
3. Verify OCR extraction
4. Check audit results
5. Create a test dispute
6. Verify email notifications (if configured)

---

## Rollback Procedure

If issues are detected:

1. Go to Management UI → Dashboard
2. Find the previous stable checkpoint
3. Click "Rollback" button
4. Verify system is stable

---

## Monitoring

### Key Metrics to Monitor

- API response times
- Error rates
- OCR processing queue length
- Database connection pool
- Memory usage

### Log Locations

- Application logs: Console output
- Error logs: `/var/log/app/error.log`
- Access logs: `/var/log/app/access.log`

---

## Troubleshooting

### Common Issues

#### 1. Database Connection Failed
- Verify `DATABASE_URL` is correct
- Check database server is running
- Verify network connectivity

#### 2. OCR Processing Fails
- Verify `MISTRAL_API_KEY` is valid
- Check API rate limits
- Review error logs for details

#### 3. File Upload Fails
- Verify S3 credentials
- Check bucket permissions
- Verify file size limits

#### 4. Authentication Issues
- Verify `JWT_SECRET` is set
- Check OAuth configuration
- Clear browser cookies and retry

---

## Security Checklist

- [ ] All secrets stored securely (not in code)
- [ ] HTTPS enabled
- [ ] Rate limiting configured
- [ ] CORS properly configured
- [ ] Input validation on all endpoints
- [ ] SQL injection prevention verified
- [ ] XSS protection enabled
- [ ] File upload validation enabled

---

## Support

For issues or questions:
- Check the Help Center in the application
- Review the troubleshooting guide above
- Contact the development team
