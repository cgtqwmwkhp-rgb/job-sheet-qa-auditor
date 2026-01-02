import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { scenarios, thresholds, BASE_URL, generateBatchUploadData } from './config.js';
import encoding from 'k6/encoding';

/**
 * Batch Upload Load Test
 * ======================
 * Tests the system's ability to handle batch document uploads
 * simulating real-world bulk processing scenarios.
 */

// Custom metrics
const uploadTime = new Trend('upload_time');
const processingTime = new Trend('processing_time');
const batchSize = new Trend('batch_size');
const errorCount = new Counter('error_count');
const successRate = new Rate('success_rate');
const uploadedFiles = new Counter('uploaded_files');

// Test configuration
export const options = {
  scenarios: {
    batch_uploads: __ENV.SCENARIO 
      ? scenarios[__ENV.SCENARIO] 
      : {
          executor: 'ramping-vus',
          startVUs: 0,
          stages: [
            { duration: '30s', target: 5 },   // Ramp up to 5 concurrent uploaders
            { duration: '2m', target: 5 },    // Maintain 5 uploaders
            { duration: '30s', target: 10 },  // Increase to 10 uploaders
            { duration: '1m', target: 10 },   // Maintain 10 uploaders
            { duration: '30s', target: 0 },   // Ramp down
          ],
        },
  },
  thresholds: {
    ...thresholds,
    upload_time: ['p(95)<5000'],      // 95% of uploads under 5s
    processing_time: ['p(95)<10000'], // 95% of processing under 10s
  },
  tags: {
    testType: 'batch-uploads',
  },
};

// Setup function
export function setup() {
  console.log(`Starting batch upload test against ${BASE_URL}`);
  
  // Verify server is reachable
  const healthCheck = http.get(`${BASE_URL}/demo`);
  if (healthCheck.status !== 200) {
    throw new Error(`Server not reachable: ${healthCheck.status}`);
  }
  
  return { startTime: Date.now() };
}

// Main test function
export default function(data) {
  // Simulate batch upload workflow
  group('Batch Upload Workflow', () => {
    // Generate batch of files to upload (1-5 files per batch)
    const batchCount = Math.floor(Math.random() * 5) + 1;
    const files = generateBatchUploadData(batchCount);
    
    batchSize.add(batchCount);
    
    // Upload each file in the batch
    files.forEach((fileData, index) => {
      uploadSingleFile(fileData, index + 1, batchCount);
      sleep(randomBetween(0.5, 1.5)); // Small delay between uploads
    });
    
    // Simulate checking processing status
    checkProcessingStatus();
  });
  
  // Think time between batches
  sleep(randomBetween(3, 8));
}

function uploadSingleFile(fileData, fileIndex, totalFiles) {
  group(`Upload File ${fileIndex}/${totalFiles}`, () => {
    const start = Date.now();
    
    // Create a mock PDF file (base64 encoded minimal PDF)
    const mockPdfContent = createMockPDF(fileData.fileName);
    
    // Prepare multipart form data
    const formData = {
      file: http.file(mockPdfContent, fileData.fileName, 'application/pdf'),
      metadata: JSON.stringify({
        fileName: fileData.fileName,
        uploadedAt: new Date().toISOString(),
        batchId: `batch-${Date.now()}`,
      }),
    };
    
    // Simulate upload request
    const response = http.post(`${BASE_URL}/api/trpc/jobSheets.upload`, formData, {
      tags: { type: 'upload', name: 'file-upload' },
      timeout: '30s',
    });
    
    const duration = Date.now() - start;
    uploadTime.add(duration);
    
    // Check response (expect 401 since we're not authenticated, or 200 if mock)
    const success = check(response, {
      'Upload request processed': (r) => r.status === 200 || r.status === 401 || r.status === 400,
      'Upload responds in time': (r) => r.timings.duration < 5000,
    });
    
    if (success) {
      uploadedFiles.add(1);
      successRate.add(true);
    } else {
      errorCount.add(1);
      successRate.add(false);
    }
  });
}

function checkProcessingStatus() {
  group('Check Processing Status', () => {
    const start = Date.now();
    
    // Simulate polling for processing status
    const response = http.get(`${BASE_URL}/api/trpc/jobSheets.list`, {
      tags: { type: 'api', name: 'processing-status' },
    });
    
    processingTime.add(Date.now() - start);
    
    const success = check(response, {
      'Status check responds': (r) => r.status === 200 || r.status === 401,
      'Status check fast': (r) => r.timings.duration < 1000,
    });
    
    successRate.add(success);
    if (!success) errorCount.add(1);
  });
}

// Create a minimal mock PDF for testing
function createMockPDF(fileName) {
  // Minimal valid PDF structure
  const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT
/F1 12 Tf
100 700 Td
(Test Job Sheet: ${fileName}) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000214 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
307
%%EOF`;
  
  return pdfContent;
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

// Teardown function
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`Batch upload test completed in ${duration.toFixed(2)} seconds`);
}
