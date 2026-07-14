/**
 * Contract Test: Pipeline metrics on /metrics (ObsSlo R7)
 *
 * Validates OCR/pipeline SLI metrics are exposed for on-call health checks.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { handleMetrics } from "../../_core/metrics";
import {
  formatPipelinePrometheusMetrics,
  recordOcrRequest,
  recordPipelineJobComplete,
  recordPipelineStage,
  resetPipelineMetrics,
} from "../../services/metrics/pipelineMetrics";

function createMockRes() {
  const headers: Record<string, string> = {};
  let body = "";

  return {
    setHeader: (key: string, value: string) => {
      headers[key] = value;
    },
    status: (_code: number) => ({
      send: (data: string) => {
        body = data;
      },
    }),
    getHeaders: () => headers,
    getBody: () => body,
  };
}

describe("Pipeline Metrics Contract (ObsSlo R7)", () => {
  beforeEach(() => {
    resetPipelineMetrics();
  });

  describe("formatPipelinePrometheusMetrics", () => {
    it("exposes OCR and pipeline job counters", () => {
      recordOcrRequest(true);
      recordOcrRequest(false);
      recordPipelineJobComplete(true);

      const body = formatPipelinePrometheusMetrics(3);

      expect(body).toContain("# TYPE ocr_requests_total counter");
      expect(body).toContain('ocr_requests_total{status="success"} 1');
      expect(body).toContain('ocr_requests_total{status="failed"} 1');
      expect(body).toContain("# TYPE pipeline_jobs_total counter");
      expect(body).toContain('pipeline_jobs_total{status="success"} 1');
      expect(body).toContain("# TYPE pipeline_dlq_depth gauge");
      expect(body).toContain("pipeline_dlq_depth 3");
    });

    it("exposes stage duration histogram with buckets", () => {
      recordPipelineStage("OCR Text Extraction", "success", 2500);

      const body = formatPipelinePrometheusMetrics();

      expect(body).toContain("# TYPE pipeline_stage_duration_seconds histogram");
      expect(body).toContain(
        'pipeline_stage_duration_seconds_bucket{stage="ocr_text_extraction",status="success",le="5"} 1'
      );
      expect(body).toContain(
        'pipeline_stage_duration_seconds_count{stage="ocr_text_extraction",status="success"} 1'
      );
    });

    it("increments stage failure counter on failed stages", () => {
      recordPipelineStage("Template Selection", "failed", 100);

      const body = formatPipelinePrometheusMetrics();

      expect(body).toContain("# TYPE pipeline_stage_failures_total counter");
      expect(body).toContain(
        'pipeline_stage_failures_total{stage="template_selection"} 1'
      );
    });
  });

  describe("/metrics integration", () => {
    it("includes pipeline metrics in handleMetrics response", () => {
      recordOcrRequest(true);
      recordPipelineStage("OCR Text Extraction", "success", 1200);

      const res = createMockRes();
      handleMetrics({} as never, res as never);

      const body = res.getBody();
      expect(body).toContain("ocr_requests_total");
      expect(body).toContain("pipeline_stage_duration_seconds");
      expect(body).toContain("pipeline_dlq_depth");
    });
  });
});
