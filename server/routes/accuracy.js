/**
 * server/routes/accuracy.js
 *
 * Routes:
 *   GET /api/accuracy-report — proxy to ai-service GET /accuracy-report
 */

import { Router } from 'express';
import axios from 'axios';

const router = Router();
const AI_URL = () => process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

// ── GET /api/accuracy-report ──────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const aiRes = await axios.get(`${AI_URL()}/accuracy-report`, { timeout: 120_000 });
    res.status(aiRes.status).json(aiRes.data);
  } catch (err) {
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    console.error('[GET /api/accuracy-report]', err.message);
    res.status(502).json({ error: 'AI service unavailable', detail: err.message });
  }
});

export default router;
