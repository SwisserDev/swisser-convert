import path from 'node:path';
import fs from 'node:fs';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import prettyBytes from 'pretty-bytes';
import { defineCommand, runMain } from 'citty';
import { validateInput } from './validate.js';
import {
  uploadGlb,
  pollJob,
  getDownloadUrl,
  downloadZip,
  stageLabel,
  RateLimitError,
  ApiError,
  ConversionError,
  TimeoutError,
} from './api.js';

declare const __VERSION__: string;
const VERSION = __VERSION__;

const STEP_ICONS = {
  upload: `${pc.cyan(pc.bold('1'))}${pc.dim('/')}${pc.dim('3')}`,
  convert: `${pc.cyan(pc.bold('2'))}${pc.dim('/')}${pc.dim('3')}`,
  download: `${pc.cyan(pc.bold('3'))}${pc.dim('/')}${pc.dim('3')}`,
};

const main = defineCommand({
  meta: {
    name: 'swisser-convert',
    version: VERSION,
    description: 'Convert GLB 3D models to FiveM-ready resources',
  },
  args: {
    file: {
      type: 'positional',
      description: 'Path to the .glb file to convert',
      required: true,
    },
    output: {
      type: 'string',
      alias: 'o',
      description: 'Output directory (defaults to current directory)',
    },
    name: {
      type: 'string',
      alias: 'n',
      description: 'Resource name (defaults to filename without extension)',
    },
  },
  run: async ({ args }) => {
    const startTime = Date.now();

    p.intro(
      `${pc.bgCyan(pc.black(' swisser-convert '))} ${pc.dim(`v${VERSION}`)}`,
    );

    // -- Validate ---------------------------------------------------------
    let input;
    try {
      input = validateInput(args.file, args.name);
    } catch (err: unknown) {
      p.cancel(err instanceof Error ? err.message : String(err));
      process.exit(2);
    }

    const outputDir = args.output ? path.resolve(args.output) : process.cwd();
    if (!fs.existsSync(outputDir)) {
      p.cancel(`Output directory does not exist: ${pc.bold(outputDir)}`);
      process.exit(2);
    }

    p.log.info(
      `${pc.bold(input.fileName)}  ${pc.dim(prettyBytes(input.fileSize))}  ${pc.dim(`\u2192 ${input.projectName}`)}`,
    );

    // -- Step 1: Upload ---------------------------------------------------
    const s1 = p.spinner();
    s1.start(`${STEP_ICONS.upload}  Uploading to Swisser...`);

    let jobId: string;
    try {
      const result = await uploadGlb(input.filePath, input.projectName);
      jobId = result.jobId;
      s1.stop(`${STEP_ICONS.upload}  ${pc.green('Uploaded')} ${pc.dim(`(job ${jobId.slice(0, 8)}...)`)}`);
    } catch (err) {
      s1.stop(`${STEP_ICONS.upload}  ${pc.red('Upload failed')}`);
      handleError(err);
      return;
    }

    // -- Step 2: Convert --------------------------------------------------
    const s2 = p.spinner();
    s2.start(`${STEP_ICONS.convert}  Starting conversion...`);

    let lastStage = '';
    let completedJob;

    try {
      completedJob = await pollJob(jobId, (job) => {
        const stage = job.progressStage || '';
        if (stage !== lastStage) {
          lastStage = stage;
          const bar = progressBar(job.progress);
          s2.message(
            `${STEP_ICONS.convert}  ${stageLabel(stage)}  ${bar} ${pc.bold(`${job.progress}%`)}`,
          );
        }
      });
      s2.stop(`${STEP_ICONS.convert}  ${pc.green('Converted')}`);
    } catch (err) {
      s2.stop(`${STEP_ICONS.convert}  ${pc.red('Conversion failed')}`);
      handleError(err);
      return;
    }

    // -- Step 3: Download -------------------------------------------------
    const s3 = p.spinner();
    s3.start(`${STEP_ICONS.download}  Downloading FiveM resource...`);

    try {
      const url = await getDownloadUrl(jobId);
      const zipName = `${input.projectName}.zip`;
      const outputPath = path.join(outputDir, zipName);
      const bytes = await downloadZip(url, outputPath);

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const zipArtifact = completedJob.artifacts.find(
        (a) => a.artifactType === 'zip',
      );
      const artifacts = completedJob.artifacts
        .filter((a) => a.artifactType !== 'zip')
        .map((a) => a.artifactType.toUpperCase());

      s3.stop(`${STEP_ICONS.download}  ${pc.green('Downloaded')}`);

      // -- Summary --------------------------------------------------------
      console.log('');
      console.log(`  ${pc.green(pc.bold('\u2713'))} ${pc.bold(outputPath)}`);
      console.log('');
      console.log(`  ${pc.dim('Size')}       ${prettyBytes(zipArtifact?.sizeBytes || bytes)}`);
      console.log(`  ${pc.dim('Artifacts')}  ${artifacts.join(pc.dim(', '))}`);
      console.log(`  ${pc.dim('Time')}       ${elapsed}s`);
      console.log('');

      p.outro(
        `Extract into ${pc.cyan('resources/')} and add ${pc.cyan(`ensure ${input.projectName}`)} to server.cfg`,
      );
    } catch (err) {
      s3.stop(`${STEP_ICONS.download}  ${pc.red('Download failed')}`);
      handleError(err);
    }
  },
});

/** Render a simple block progress bar. */
function progressBar(percent: number): string {
  const width = 16;
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return pc.cyan('\u2588'.repeat(filled)) + pc.dim('\u2591'.repeat(empty));
}

function handleError(err: unknown): never {
  if (err instanceof RateLimitError) {
    p.log.warn(
      [
        `Hourly limit reached ${pc.dim('(10 free conversions per hour)')}`,
        `  ${pc.bold(err.humanRetry)}`,
        '',
        `  ${pc.dim('Unlimited conversions at')} ${pc.cyan('https://ai.swisser.dev')}`,
      ].join('\n'),
    );
    process.exit(3);
  }

  if (err instanceof ConversionError) {
    p.log.error(err.message);
    p.cancel('Conversion could not be completed');
    process.exit(1);
  }

  if (err instanceof TimeoutError) {
    p.log.error(err.message);
    p.cancel('Server took too long to respond');
    process.exit(1);
  }

  if (err instanceof ApiError) {
    p.log.error(`${pc.bold(`${err.status}`)} ${err.message}`);
    if (err.status >= 500) {
      p.log.info(pc.dim('The Swisser API may be temporarily down. Try again shortly.'));
    }
    process.exit(1);
  }

  // Network errors
  const cause = (err instanceof Error ? (err as Error & { cause?: { code?: string } }).cause : undefined);
  if (cause?.code === 'ECONNREFUSED' || cause?.code === 'ENOTFOUND' || cause?.code === 'UND_ERR_CONNECT_TIMEOUT') {
    p.log.error(
      [
        'Could not reach the Swisser API',
        '',
        `  ${pc.dim('\u2022')} Check your internet connection`,
        `  ${pc.dim('\u2022')} The API may be temporarily down`,
      ].join('\n'),
    );
    process.exit(1);
  }

  if (err instanceof Error) {
    p.cancel(err.message);
  } else {
    p.cancel('An unexpected error occurred');
  }

  if (process.env.DEBUG) {
    console.error(err);
  } else {
    p.log.info(pc.dim(`Run with DEBUG=1 for details`));
  }

  process.exit(1);
}

process.on('SIGINT', () => {
  console.log('');
  p.cancel('Cancelled');
  process.exit(130);
});

runMain(main);
