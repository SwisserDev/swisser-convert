export const API_BASE = process.env.SWISSER_API_URL || 'https://ai.swisser.dev';

export const ENDPOINTS = {
  convert: `${API_BASE}/api/v2/assets/convert/public`,
  job: (jobId: string) => `${API_BASE}/api/v2/assets/convert/public/${jobId}`,
  download: (jobId: string) => `${API_BASE}/api/v2/assets/convert/public/${jobId}/download`,
} as const;

export const GLB_MAGIC = 0x46546c67; // "glTF" in little-endian
export const MAX_GLB_SIZE = 50 * 1024 * 1024; // 50 MB

export const POLL_INTERVAL_MS = 2500;
export const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Maps API progress stages to human-readable status lines
export const STAGE_LABELS: Record<string, string> = {
  queued: 'Queued...',
  uploading: 'Uploading to worker...',
  analyzing: 'Analyzing GLB geometry...',
  blender_converting: 'Converting to FiveM format...',
  textures: 'Building texture dictionary...',
  lod_generation: 'Generating LOD meshes...',
  packaging: 'Packaging FiveM resource...',
  finalizing: 'Finalizing...',
};
