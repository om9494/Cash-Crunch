/**
 * server/routes/admin.js
 *
 * Routes:
 *   POST /api/admin/reset — re-seed the database and warm the forecast cache.
 *
 * This route is only for demo purposes — it lets a presenter reset all data
 * between demo run-throughs without opening a terminal.
 *
 * What it does (in order):
 *   1. Runs server/scripts/seed.js as a child process to wipe + re-seed all
 *      core collections.
 *   2. Calls ai-service GET /forecast/all to rebuild the forecast cache for
 *      every merchant.
 *
 * The response streams a JSON object with the results of each step so the
 * client can show progress.
 *
 * NOTE: no authentication — this is a local demo tool. Do not expose this
 * to the internet.
 */

import { Router } from 'express';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import axios from 'axios';

const router = Router();
const AI_URL = () => process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

// Resolve the seed script path relative to this file: ../scripts/seed.js
const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_SCRIPT = resolve(__dirname, '../scripts/seed.js');

// ── POST /api/admin/reset ──────────────────────────────────────────────────
router.post('/reset', async (req, res) => {
  const steps = [];

  // ── Step 1: run the seed script ──────────────────────────────────────────
  try {
    const seedOutput = await runSeed();
    steps.push({ step: 'seed', status: 'ok', output: seedOutput });
  } catch (err) {
    steps.push({ step: 'seed', status: 'error', detail: err.message });
    return res.status(500).json({
      error: 'Seed script failed — database may be in a partial state',
      steps,
    });
  }

  // ── Step 2: warm the ai-service forecast cache ───────────────────────────
  try {
    const forecastRes = await axios.get(`${AI_URL()}/forecast/all`, { timeout: 120_000 });
    const summaries = forecastRes.data ?? [];
    const errCount = summaries.filter((s) => s.error).length;
    steps.push({
      step:      'forecast_warm',
      status:    errCount === 0 ? 'ok' : 'partial',
      merchants: summaries.length,
      errors:    errCount,
    });
  } catch (err) {
    // Don't fail the whole reset if ai-service is unreachable —
    // the seed completed successfully, forecasts will rebuild on next load.
    steps.push({
      step:   'forecast_warm',
      status: 'skipped',
      detail: 'AI service unreachable — forecasts will rebuild on next dashboard load',
    });
  }

  res.json({ reset: 'complete', steps });
});

// ── Helper: run seed.js as a child process ───────────────────────────────────
// Returns a Promise<string> with the combined stdout of the seed run.
// Rejects on non-zero exit.
function runSeed() {
  return new Promise((resolve, reject) => {
    // Use the same node binary that's running this process so the ES module
    // flag / version matches exactly.
    const child = spawn(process.execPath, [SEED_SCRIPT], {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(stderr.trim() || `seed.js exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn seed.js: ${err.message}`));
    });
  });
}

export default router;
