import fs from 'node:fs';
import path from 'node:path';
import { ENDPOINTS, POLL_INTERVAL_MS, POLL_TIMEOUT_MS, STAGE_LABELS } from './constants.js';

export interface JobStatus {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'canceled';
  projectName: string;
  progress: number;
  progressStage: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
  artifacts: Array<{
    id: string;
    artifactType: string;
    sizeBytes: number;
  }>;
}

export interface UploadResult {
  jobId: string;
}

/**
 * Upload a GLB file to the conversion API.
 */
export async function uploadGlb(
  filePath: string,
  projectName: string,
): Promise<UploadResult> {
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: 'model/gltf-binary' });

  const form = new FormData();
  form.append('sourceGlb', blob, path.basename(filePath));
  form.append('projectName', projectName);

  const res = await fetch(ENDPOINTS.convert, {
    method: 'POST',
    body: form,
  });

  if (res.status === 429) {
    throw RateLimitError.fromHeaders(res.headers);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, body);
  }

  const json = await res.json() as { success: boolean; data: { jobId: string } };
  return { jobId: json.data.jobId };
}

/**
 * Poll job status until completion or failure.
 */
export async function pollJob(
  jobId: string,
  onProgress: (status: JobStatus) => void,
): Promise<JobStatus> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const res = await fetch(ENDPOINTS.job(jobId));

    if (!res.ok) {
      throw new ApiError(res.status, await res.text());
    }

    const json = await res.json() as { success: boolean; data: JobStatus };
    const job = json.data;

    onProgress(job);

    if (job.status === 'completed') return job;

    if (job.status === 'failed' || job.status === 'canceled') {
      throw new ConversionError(
        job.errorMessage || `Conversion ${job.status}`,
        job.status,
      );
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new TimeoutError();
}

/**
 * Get a signed download URL for the completed job's ZIP.
 */
export async function getDownloadUrl(jobId: string): Promise<string> {
  const res = await fetch(ENDPOINTS.download(jobId));

  if (!res.ok) {
    throw new ApiError(res.status, await res.text());
  }

  const json = await res.json() as { success: boolean; data: { url: string } };
  return json.data.url;
}

/**
 * Download the ZIP to disk. Returns byte count.
 */
export async function downloadZip(url: string, outputPath: string): Promise<number> {
  const res = await fetch(url);

  if (!res.ok) {
    throw new ApiError(res.status, 'Failed to download ZIP');
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  return buffer.length;
}

export function stageLabel(stage: string | null): string {
  if (!stage) return 'Processing...';
  return STAGE_LABELS[stage] || `Processing (${stage})...`;
}

// -- Errors ---------------------------------------------------------------

export class RateLimitError extends Error {
  retryAfterSec: number | null;

  constructor(retryAfterSec: number | null) {
    super('Rate limit exceeded');
    this.name = 'RateLimitError';
    this.retryAfterSec = retryAfterSec;
  }

  static fromHeaders(headers: Headers): RateLimitError {
    // Prefer Retry-After (seconds until reset) over X-RateLimit-Reset (unix timestamp)
    const retryAfter = headers.get('retry-after');
    if (retryAfter) {
      const sec = parseInt(retryAfter, 10);
      if (!isNaN(sec) && sec > 0) return new RateLimitError(sec);
    }

    const resetEpoch = headers.get('x-ratelimit-reset');
    if (resetEpoch) {
      const epoch = parseInt(resetEpoch, 10);
      if (!isNaN(epoch) && epoch > 0) {
        const sec = Math.max(1, Math.ceil(epoch - Date.now() / 1000));
        return new RateLimitError(sec);
      }
    }

    return new RateLimitError(null);
  }

  get humanRetry(): string {
    if (!this.retryAfterSec || this.retryAfterSec <= 0) return 'Try again later';
    const h = Math.floor(this.retryAfterSec / 3600);
    const m = Math.floor((this.retryAfterSec % 3600) / 60);
    if (h > 0 && m > 0) return `Resets in ${h}h ${m}m`;
    if (h > 0) return `Resets in ${h}h`;
    if (m > 0) return `Resets in ${m}m`;
    return `Resets in <1m`;
  }
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, body: string) {
    let message: string;
    try {
      const parsed = JSON.parse(body);
      message = parsed.error?.message || parsed.error || parsed.message || body;
    } catch {
      message = body;
    }
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export class ConversionError extends Error {
  conversionStatus: string;

  constructor(message: string, status: string) {
    super(message);
    this.name = 'ConversionError';
    this.conversionStatus = status;
  }
}

export class TimeoutError extends Error {
  constructor() {
    super('Conversion timed out after 5 minutes');
    this.name = 'TimeoutError';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
