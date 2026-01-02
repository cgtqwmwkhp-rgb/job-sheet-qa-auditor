/**
 * k6 Load Testing Configuration
 * =============================
 * Defines different test scenarios for the Job Sheet QA Auditor
 */

// Test scenarios configuration
export const scenarios = {
  // Smoke test - verify system works under minimal load
  smoke: {
    executor: 'constant-vus',
    vus: 1,
    duration: '30s',
  },
  
  // Load test - normal expected load
  load: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: 10 },  // Ramp up to 10 users
      { duration: '3m', target: 10 },  // Stay at 10 users
      { duration: '1m', target: 0 },   // Ramp down
    ],
  },
  
  // Stress test - push beyond normal capacity
  stress: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: 10 },  // Ramp up
      { duration: '2m', target: 25 },  // Push to 25 users
      { duration: '2m', target: 50 },  // Push to 50 users
      { duration: '2m', target: 25 },  // Scale down
      { duration: '1m', target: 0 },   // Ramp down
    ],
  },
  
  // Spike test - sudden surge of users
  spike: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 5 },   // Normal load
      { duration: '10s', target: 50 },  // Spike!
      { duration: '1m', target: 50 },   // Hold spike
      { duration: '10s', target: 5 },   // Return to normal
      { duration: '30s', target: 0 },   // Ramp down
    ],
  },
  
  // Soak test - extended duration for memory leaks
  soak: {
    executor: 'constant-vus',
    vus: 10,
    duration: '10m',
  },
};

// Performance thresholds
export const thresholds = {
  // HTTP request duration
  http_req_duration: ['p(95)<500', 'p(99)<1000'],
  
  // HTTP request failure rate
  http_req_failed: ['rate<0.01'],
  
  // Custom metrics
  'http_req_duration{type:api}': ['p(95)<300'],
  'http_req_duration{type:page}': ['p(95)<1000'],
  
  // Checks pass rate
  checks: ['rate>0.95'],
};

// Base URL configuration
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// API endpoints to test
export const API_ENDPOINTS = {
  // Public endpoints
  health: '/api/health',
  
  // tRPC endpoints (require auth in production)
  stats: '/api/trpc/stats.dashboard',
  jobSheets: '/api/trpc/jobSheets.list',
  audits: '/api/trpc/audits.list',
  specs: '/api/trpc/goldSpecs.list',
  users: '/api/trpc/users.list',
  
  // Processing endpoints
  upload: '/api/trpc/jobSheets.upload',
  process: '/api/trpc/jobSheets.process',
};

// Test data generators
export function generateJobSheetData() {
  return {
    fileName: `test-job-sheet-${Date.now()}.pdf`,
    fileSize: Math.floor(Math.random() * 5000000) + 100000, // 100KB - 5MB
    mimeType: 'application/pdf',
  };
}

export function generateBatchUploadData(count = 10) {
  return Array.from({ length: count }, () => generateJobSheetData());
}
