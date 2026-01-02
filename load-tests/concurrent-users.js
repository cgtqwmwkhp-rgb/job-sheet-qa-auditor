import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { scenarios, thresholds, BASE_URL, API_ENDPOINTS } from './config.js';

/**
 * Concurrent Users Load Test
 * ==========================
 * Tests the system's ability to handle multiple concurrent user sessions
 * simulating real-world usage patterns.
 */

// Custom metrics
const pageLoadTime = new Trend('page_load_time');
const apiResponseTime = new Trend('api_response_time');
const errorCount = new Counter('error_count');
const successRate = new Rate('success_rate');

// Test configuration
export const options = {
  scenarios: {
    // Default to load test scenario, can be overridden via CLI
    concurrent_users: __ENV.SCENARIO 
      ? scenarios[__ENV.SCENARIO] 
      : scenarios.load,
  },
  thresholds: thresholds,
  // Tags for better metric organization
  tags: {
    testType: 'concurrent-users',
  },
};

// Setup function - runs once before test
export function setup() {
  console.log(`Starting concurrent users test against ${BASE_URL}`);
  console.log(`Scenario: ${__ENV.SCENARIO || 'load'}`);
  
  // Verify server is reachable
  const healthCheck = http.get(`${BASE_URL}/demo`);
  if (healthCheck.status !== 200) {
    throw new Error(`Server not reachable: ${healthCheck.status}`);
  }
  
  return { startTime: Date.now() };
}

// Main test function - runs for each virtual user
export default function(data) {
  // Simulate realistic user behavior with different actions
  const userActions = [
    () => visitDemoGateway(),
    () => visitDashboard(),
    () => visitUploadPage(),
    () => visitAuditResults(),
    () => visitSettings(),
    () => callStatsAPI(),
    () => callJobSheetsAPI(),
  ];
  
  // Randomly select and execute user actions
  group('User Session', () => {
    // Always start with demo gateway (login)
    visitDemoGateway();
    sleep(randomBetween(1, 3));
    
    // Perform 3-5 random actions per session
    const actionCount = Math.floor(Math.random() * 3) + 3;
    for (let i = 0; i < actionCount; i++) {
      const action = userActions[Math.floor(Math.random() * userActions.length)];
      action();
      sleep(randomBetween(0.5, 2));
    }
  });
  
  // Think time between sessions
  sleep(randomBetween(1, 5));
}

// Page visit functions
function visitDemoGateway() {
  group('Demo Gateway', () => {
    const start = Date.now();
    const response = http.get(`${BASE_URL}/demo`, {
      tags: { type: 'page', name: 'demo-gateway' },
    });
    
    pageLoadTime.add(Date.now() - start);
    
    const success = check(response, {
      'Demo Gateway loads': (r) => r.status === 200,
      'Demo Gateway has content': (r) => r.body && r.body.length > 0,
      'Demo Gateway loads fast': (r) => r.timings.duration < 1000,
    });
    
    successRate.add(success);
    if (!success) errorCount.add(1);
  });
}

function visitDashboard() {
  group('Dashboard', () => {
    const start = Date.now();
    const response = http.get(`${BASE_URL}/`, {
      tags: { type: 'page', name: 'dashboard' },
    });
    
    pageLoadTime.add(Date.now() - start);
    
    const success = check(response, {
      'Dashboard loads': (r) => r.status === 200 || r.status === 302,
      'Dashboard loads fast': (r) => r.timings.duration < 1500,
    });
    
    successRate.add(success);
    if (!success) errorCount.add(1);
  });
}

function visitUploadPage() {
  group('Upload Page', () => {
    const start = Date.now();
    const response = http.get(`${BASE_URL}/upload`, {
      tags: { type: 'page', name: 'upload' },
    });
    
    pageLoadTime.add(Date.now() - start);
    
    const success = check(response, {
      'Upload page loads': (r) => r.status === 200 || r.status === 302,
      'Upload page loads fast': (r) => r.timings.duration < 1500,
    });
    
    successRate.add(success);
    if (!success) errorCount.add(1);
  });
}

function visitAuditResults() {
  group('Audit Results', () => {
    const start = Date.now();
    const response = http.get(`${BASE_URL}/audits`, {
      tags: { type: 'page', name: 'audits' },
    });
    
    pageLoadTime.add(Date.now() - start);
    
    const success = check(response, {
      'Audit Results loads': (r) => r.status === 200 || r.status === 302,
      'Audit Results loads fast': (r) => r.timings.duration < 1500,
    });
    
    successRate.add(success);
    if (!success) errorCount.add(1);
  });
}

function visitSettings() {
  group('Settings', () => {
    const start = Date.now();
    const response = http.get(`${BASE_URL}/settings`, {
      tags: { type: 'page', name: 'settings' },
    });
    
    pageLoadTime.add(Date.now() - start);
    
    const success = check(response, {
      'Settings loads': (r) => r.status === 200 || r.status === 302,
      'Settings loads fast': (r) => r.timings.duration < 1500,
    });
    
    successRate.add(success);
    if (!success) errorCount.add(1);
  });
}

// API call functions
function callStatsAPI() {
  group('Stats API', () => {
    const start = Date.now();
    const response = http.get(`${BASE_URL}${API_ENDPOINTS.stats}`, {
      tags: { type: 'api', name: 'stats' },
    });
    
    apiResponseTime.add(Date.now() - start);
    
    const success = check(response, {
      'Stats API responds': (r) => r.status === 200 || r.status === 401,
      'Stats API fast': (r) => r.timings.duration < 500,
    });
    
    successRate.add(success);
    if (!success) errorCount.add(1);
  });
}

function callJobSheetsAPI() {
  group('Job Sheets API', () => {
    const start = Date.now();
    const response = http.get(`${BASE_URL}${API_ENDPOINTS.jobSheets}`, {
      tags: { type: 'api', name: 'jobSheets' },
    });
    
    apiResponseTime.add(Date.now() - start);
    
    const success = check(response, {
      'Job Sheets API responds': (r) => r.status === 200 || r.status === 401,
      'Job Sheets API fast': (r) => r.timings.duration < 500,
    });
    
    successRate.add(success);
    if (!success) errorCount.add(1);
  });
}

// Utility functions
function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

// Teardown function - runs once after test
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`Test completed in ${duration.toFixed(2)} seconds`);
}
