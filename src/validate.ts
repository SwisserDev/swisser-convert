import fs from 'node:fs';
import path from 'node:path';
import { GLB_MAGIC, MAX_GLB_SIZE } from './constants.js';

export interface ValidatedInput {
  filePath: string;
  fileName: string;
  fileSize: number;
  projectName: string;
}

/**
 * Validate the input file and derive a project name.
 * Throws descriptive errors for every failure mode.
 */
export function validateInput(filePath: string, nameOverride?: string): ValidatedInput {
  const resolved = path.resolve(filePath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`File not found: ${resolved}`);
  }

  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    throw new Error(`Not a file: ${resolved}`);
  }

  const ext = path.extname(resolved).toLowerCase();
  if (ext !== '.glb') {
    throw new Error(
      `Expected a .glb file, got ${ext || '(no extension)'}`,
    );
  }

  if (stat.size > MAX_GLB_SIZE) {
    const sizeMb = Math.round(stat.size / 1024 / 1024);
    throw new Error(`File too large: ${sizeMb} MB exceeds 50 MB limit`);
  }

  if (stat.size < 12) {
    throw new Error('File too small to be a valid GLB');
  }

  // Validate GLB magic bytes
  const fd = fs.openSync(resolved, 'r');
  const header = Buffer.alloc(4);
  fs.readSync(fd, header, 0, 4, 0);
  fs.closeSync(fd);

  if (header.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error('Invalid GLB file: missing glTF magic bytes');
  }

  const fileName = path.basename(resolved);
  const projectName = nameOverride || path.basename(resolved, ext);

  return { filePath: resolved, fileName, fileSize: stat.size, projectName };
}
