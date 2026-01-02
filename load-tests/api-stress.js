import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { scenarios, thresholds, BASE_URL, API_ENDPOINTS } from './config.js';

/**
 * API Stress Test
 * ===============
 * Tests the API endpoints under heavy load to identify
 * performance bottlenecks and breaking points.
 */

// Custom metrics
const apiLatency = new Trend('api_latency');
const apiErrors = new Counter('api_errors');
const apiSuccessRate = new Rate('api_success_rate');
const requestsPerEndpoint = new Counter('requests_per_endpoint');

// Test configuration
export const options = {
  scenarios: {
    api_stress: __ENV.SCENARIO 
      ? scenarios[__ENV.SCENARIO] 
      : scenarios.stress,
  },
  thresholds: {
    ...thresholds,
    api_latency: ['p(95)<500', 'p(99)<1000'],
    api_success_rate: ['rate>0.95'],
  },
  tags: {
    testType: 'api-stress',
  },
};

// API endpoints with their weights (higher = more frequent)
const WEIGHTED_ENDPOINTS = [
  { name: 'stats', path: '/api/trpc/stats.dashboard', weight: 30 },
  { name: 'jobSheets', path: '/api/trpc/jobSheets.list', weight: 25 },
  { name: 'audits', path: '/api/trpc/audits.list', weight: 20 },
  { name: 'specs', path: '/api/trpc/goldSpecs.list', weight: 10 },
  { name: 'users', path: '/api/trpc/users.list', weight: 10 },
  { name: 'disputes', path: '/api/trpc/disputes.list', weight: 5 },
];

// Setup function
export function setup() {
  console.log(`Starting API stress test against ${BASE_URL}`);
  console.log(`Scenario: ${__ENV.SCENARIO || 'stress'}`);
  
  // Verify server is reachable
  const healthCheck = http.get(`${BASE_URL}/demo`);
  if (healthCheck.status !== 200) {
    throw new Error(`Server not reachable: ${healthCheck.status}`);
  }
  
  return { 
    startTime: Date.now(),
    endpoints: WEIGHTED_ENDPOINTS,
  };
}

// Main test function
export default function(data) {
  // Select endpoint based on weight
  const endpoint = selectWeightedEndpoint(data.endpoints);
  
  group(`API: ${endpoint.name}`, () => {
    const start = Date.now();
    
    const response = http.get(`${BASE_URL}${endpoint.path}`, {
      tags: { 
        type: 'api', 
        endpoint: endpoint.name,
      },
      timeout: '10s',
    });
    
    const latency = Date.now() - start;
    apiLatency.add(latency);
    requestsPerEndpoint.add(1, { endpoint: endpoint.name });
    
    // Check response
    const success = check(response, {
      'API responds': (r) => r.status === 200 || r.status === 401 || r.status === 400,
      'API responds fast': (r) => r.timings.duration < 1000,
      'No server errors': (r) => r.status < 500,
    });
    
    if (success) {
      apiSuccessRate.add(true);
    } else {
      apiErrors.add(1);
      apiSuccessRate.add(false);
      console.log(`Error on ${endpoint.name}: ${response.status} - ${response.body}`);
    }
  });
  
  // Minimal think time for stress testing
  sleep(randomBetween(0.1, 0.5));
}

// Select endpoint based on weight
function selectWeightedEndpoint(endpoints) {
  const totalWeight = endpoints.reduce((sum, ep) => sum + ep.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const endpoint of endpoints) {
    random -= endpoint.weight;
    if (random <= 0) {
      return endpoint;
    }
  }
  
  return endpoints[0];
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

// Teardown function
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`API stress test completed in ${duration.toFixed(2)} seconds`);
}
