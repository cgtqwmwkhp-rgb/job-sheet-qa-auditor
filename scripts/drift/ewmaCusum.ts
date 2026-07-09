/**
 * EWMA / CUSUM detectors for rate time series (PR-18).
 *
 * Pure functions — no I/O. Used by scripts/drift CLI and server driftAnalytics.
 */

export interface RatePoint {
  /** Bucket key, typically YYYY-MM-DD */
  t: string;
  /** Observed rate in [0, 1] (e.g. defect rate) */
  rate: number;
  /** Optional sample size for the bucket */
  n?: number;
}

export interface EwmaConfig {
  /** Smoothing factor λ in (0, 1]; higher = more weight on recent */
  lambda: number;
  /** Multiplier on baseline σ for warning band */
  warningSigma: number;
  /** Multiplier on baseline σ for critical band */
  criticalSigma: number;
  /** Minimum points before alerting */
  minPoints: number;
  /** Optional fixed process mean; default = mean of baseline window */
  target?: number;
  /** Optional fixed σ; default = stdev of baseline window */
  sigma?: number;
  /** Number of leading points used as baseline when target/sigma omitted */
  baselinePoints?: number;
}

export interface CusumConfig {
  /** Allowance k (typically 0.5σ) expressed in absolute rate units */
  k: number;
  /** Decision interval h (typically 4–5σ) in absolute rate units */
  h: number;
  /** Minimum points before alerting */
  minPoints: number;
  /** Optional fixed process mean; default = mean of baseline window */
  target?: number;
  /** Number of leading points used as baseline when target omitted */
  baselinePoints?: number;
}

export const DEFAULT_EWMA_CONFIG: EwmaConfig = {
  lambda: 0.2,
  warningSigma: 2,
  criticalSigma: 3,
  minPoints: 5,
};

export const DEFAULT_CUSUM_CONFIG: CusumConfig = {
  k: 0.02,
  h: 0.08,
  minPoints: 5,
};

export interface EwmaState {
  ewma: number[];
  /** Running estimate of process mean (target) */
  target: number;
  /** Sample stdev of the input series (population, ddof=0) */
  sigma: number;
  upperWarning: number;
  upperCritical: number;
  lowerWarning: number;
  lowerCritical: number;
}

export interface EwmaResult {
  state: EwmaState;
  /** Indices where EWMA crossed a band */
  breachIndices: number[];
  severity: "none" | "warning" | "critical";
  lastEwma: number;
  lastRate: number;
}

export interface CusumState {
  /** High-side cumulative sum S+ */
  sHigh: number[];
  /** Low-side cumulative sum S− */
  sLow: number[];
  target: number;
}

export interface CusumResult {
  state: CusumState;
  breachIndices: number[];
  /** Direction of the most recent breach */
  direction: "none" | "increase" | "decrease";
  severity: "none" | "warning" | "critical";
  lastSHigh: number;
  lastSLow: number;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance =
    values.reduce((acc, v) => acc + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Compute EWMA of a rate series and classify band breaches.
 * Target/σ default to the leading baseline window so late shifts are detectable.
 */
export function computeEwma(
  series: RatePoint[],
  config: EwmaConfig = DEFAULT_EWMA_CONFIG
): EwmaResult {
  const rates = series.map(p => p.rate);
  const baselineN = Math.min(
    config.baselinePoints ?? Math.max(config.minPoints, 5),
    Math.max(rates.length, 1)
  );
  const baselineRates = rates.slice(0, baselineN);
  const target = config.target ?? mean(baselineRates);
  const sigma = Math.max(
    config.sigma ?? (baselineRates.length >= 2 ? stdev(baselineRates) : 0.05),
    1e-4
  );
  const ewma: number[] = [];
  const breachIndices: number[] = [];
  let severity: EwmaResult["severity"] = "none";

  const upperWarning = target + config.warningSigma * sigma;
  const upperCritical = target + config.criticalSigma * sigma;
  const lowerWarning = target - config.warningSigma * sigma;
  const lowerCritical = target - config.criticalSigma * sigma;

  for (let i = 0; i < rates.length; i++) {
    const prev = i === 0 ? rates[0] : ewma[i - 1];
    const z = config.lambda * rates[i] + (1 - config.lambda) * prev;
    ewma.push(z);

    if (i + 1 < config.minPoints) continue;

    if (z >= upperCritical || z <= lowerCritical) {
      breachIndices.push(i);
      severity = "critical";
    } else if (z >= upperWarning || z <= lowerWarning) {
      breachIndices.push(i);
      if (severity !== "critical") severity = "warning";
    }
  }

  return {
    state: {
      ewma,
      target,
      sigma,
      upperWarning,
      upperCritical,
      lowerWarning,
      lowerCritical,
    },
    breachIndices,
    severity,
    lastEwma: ewma.length > 0 ? ewma[ewma.length - 1] : target,
    lastRate: rates.length > 0 ? rates[rates.length - 1] : 0,
  };
}

/**
 * Two-sided CUSUM on a rate series (Page's scheme).
 * Target defaults to the leading baseline window mean.
 * S+[i] = max(0, S+[i-1] + (x[i] - target - k))
 * S−[i] = max(0, S−[i-1] + (target - k - x[i]))
 */
export function computeCusum(
  series: RatePoint[],
  config: CusumConfig = DEFAULT_CUSUM_CONFIG
): CusumResult {
  const rates = series.map(p => p.rate);
  const baselineN = Math.min(
    config.baselinePoints ?? Math.max(config.minPoints, 5),
    Math.max(rates.length, 1)
  );
  const target = config.target ?? mean(rates.slice(0, baselineN));
  const sHigh: number[] = [];
  const sLow: number[] = [];
  const breachIndices: number[] = [];
  let direction: CusumResult["direction"] = "none";
  let severity: CusumResult["severity"] = "none";

  let sh = 0;
  let sl = 0;

  for (let i = 0; i < rates.length; i++) {
    sh = Math.max(0, sh + (rates[i] - target - config.k));
    sl = Math.max(0, sl + (target - config.k - rates[i]));
    sHigh.push(sh);
    sLow.push(sl);

    if (i + 1 < config.minPoints) continue;

    if (sh >= config.h) {
      breachIndices.push(i);
      direction = "increase";
      severity = sh >= config.h * 1.5 ? "critical" : "warning";
    } else if (sl >= config.h) {
      breachIndices.push(i);
      direction = "decrease";
      // Decrease in defect rate is informational — treat as warning at most
      if (severity === "none") severity = "warning";
    }
  }

  return {
    state: { sHigh, sLow, target },
    breachIndices,
    direction,
    severity,
    lastSHigh: sHigh.length > 0 ? sHigh[sHigh.length - 1] : 0,
    lastSLow: sLow.length > 0 ? sLow[sLow.length - 1] : 0,
  };
}

/**
 * Calibration histogram: predicted confidence vs observed pass rate.
 * Bins are [0,0.1), …, [0.9,1.0].
 */
export interface CalibrationBin {
  binStart: number;
  binEnd: number;
  label: string;
  count: number;
  /** Mean predicted confidence in bin */
  meanPredicted: number;
  /** Observed positive rate (e.g. pass rate) in bin */
  observedRate: number;
  /** |meanPredicted - observedRate| */
  absError: number;
}

export interface CalibrationHistogram {
  bins: CalibrationBin[];
  totalCount: number;
  /** Expected Calibration Error (weighted mean abs error) */
  ece: number;
  /** Max abs error across non-empty bins */
  maxAbsError: number;
}

export function buildCalibrationHistogram(
  samples: Array<{ predicted: number; observed: boolean }>,
  binCount: number = 10
): CalibrationHistogram {
  const width = 1 / binCount;
  const bins: CalibrationBin[] = [];

  for (let i = 0; i < binCount; i++) {
    const binStart = i * width;
    const binEnd = i === binCount - 1 ? 1 : (i + 1) * width;
    bins.push({
      binStart,
      binEnd,
      label: `${Math.round(binStart * 100)}–${Math.round(binEnd * 100)}%`,
      count: 0,
      meanPredicted: 0,
      observedRate: 0,
      absError: 0,
    });
  }

  for (const sample of samples) {
    const p = Math.min(1, Math.max(0, sample.predicted));
    let idx = Math.floor(p / width);
    if (idx >= binCount) idx = binCount - 1;
    const bin = bins[idx];
    bin.count++;
    bin.meanPredicted += p;
    if (sample.observed) bin.observedRate += 1;
  }

  let ece = 0;
  let maxAbsError = 0;
  const total = samples.length;

  for (const bin of bins) {
    if (bin.count === 0) continue;
    bin.meanPredicted /= bin.count;
    bin.observedRate /= bin.count;
    bin.absError = Math.abs(bin.meanPredicted - bin.observedRate);
    ece += (bin.count / Math.max(total, 1)) * bin.absError;
    if (bin.absError > maxAbsError) maxAbsError = bin.absError;
  }

  return { bins, totalCount: total, ece, maxAbsError };
}
