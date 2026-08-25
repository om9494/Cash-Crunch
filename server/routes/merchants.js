/**
 * server/routes/merchants.js
 *
 * Routes:
 *   GET  /api/merchants             — list all merchants with latest cash-health status
 *   GET  /api/merchants/:id         — merchant detail with latest forecast + recommendation
 *   POST /api/merchants/:id/forecast  — proxy to ai-service to force a re-run
 *   POST /api/merchants/:id/recommend — proxy to ai-service for a fresh recommendation
 *
 * Design choice: GET /api/merchants reads CACHED Forecast documents from MongoDB
 * (not a live ai-service call) so the list view is fast and doesn't stall when
 * the ai-service is down. The POST /forecast route is the explicit way to force
 * a re-run.
 */

import { Router } from 'express';
import axios from 'axios';
import Merchant from '../models/Merchant.js';
import Forecast from '../models/Forecast.js';
import Recommendation from '../models/Recommendation.js';

const router = Router();
const AI_URL = () => process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

// ── GET /api/merchants ────────────────────────────────────────────────────────
// Returns every merchant with their most-recent cached forecast summary.
// Uses cached Forecast documents — no ai-service call — so this stays fast.
router.get('/', async (req, res) => {
  try {
    const merchants = await Merchant.find().lean();

    // Bulk-fetch latest forecast per merchant in a single aggregation
    const latestForecasts = await Forecast.aggregate([
      { $sort: { merchant_id: 1, generated_at: -1 } },
      {
        $group: {
          _id:                    '$merchant_id',
          generated_at:           { $first: '$generated_at' },
          shortfall_detected:     { $first: '$shortfall_detected' },
          shortfall_date:         { $first: '$shortfall_date' },
          shortfall_amount_paise: { $first: '$shortfall_amount_paise' },
        },
      },
    ]);

    const forecastMap = Object.fromEntries(
      latestForecasts.map((f) => [f._id, f])
    );

    const result = merchants.map((m) => {
      const f = forecastMap[m.merchant_id] || null;
      return {
        merchant_id:      m.merchant_id,
        name:             m.name,
        business_type:    m.business_type,
        employees_count:  m.employees_count,
        fund_account_id:  m.fund_account_id,
        cash_health: f
          ? {
              generated_at:           f.generated_at,
              shortfall_detected:     f.shortfall_detected,
              shortfall_date:         f.shortfall_date,
              shortfall_amount_paise: f.shortfall_amount_paise,
            }
          : null,
      };
    });

    res.json(result);
  } catch (err) {
    console.error('[GET /api/merchants]', err.message);
    res.status(500).json({ error: 'Failed to fetch merchants', detail: err.message });
  }
});

// ── GET /api/merchants/:id ────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const merchant = await Merchant.findOne({ merchant_id: req.params.id }).lean();
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found', merchant_id: req.params.id });
    }

    // Latest forecast (full 14-day projection)
    const forecast = await Forecast.findOne({ merchant_id: req.params.id })
      .sort({ generated_at: -1 })
      .lean();

    // Latest recommendation (any status)
    const recommendation = await Recommendation.findOne({ merchant_id: req.params.id })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      merchant,
      latest_forecast:       forecast || null,
      latest_recommendation: recommendation || null,
    });
  } catch (err) {
    console.error('[GET /api/merchants/:id]', err.message);
    res.status(500).json({ error: 'Failed to fetch merchant detail', detail: err.message });
  }
});

// ── POST /api/merchants/:id/forecast ─────────────────────────────────────────
// Proxy to ai-service GET /forecast/:id — forces a fresh forecast run.
// The ai-service exposes this as GET (idempotent re-run), so we call GET
// internally even though our Express surface is POST (dashboard "force refresh"
// button semantics).
router.post('/:id/forecast', async (req, res) => {
  const { id } = req.params;
  try {
    const merchant = await Merchant.findOne({ merchant_id: id }).lean();
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found', merchant_id: id });
    }

    const aiRes = await axios.get(`${AI_URL()}/forecast/${id}`, { timeout: 30_000 });
    res.status(aiRes.status).json(aiRes.data);
  } catch (err) {
    if (err.response) {
      // ai-service returned a non-2xx — pass it through
      return res.status(err.response.status).json(err.response.data);
    }
    console.error('[POST /api/merchants/:id/forecast]', err.message);
    res.status(502).json({ error: 'AI service unavailable', detail: err.message });
  }
});

// ── POST /api/merchants/:id/recommend ────────────────────────────────────────
// Proxy to ai-service POST /recommend/:id — generates a new recommendation.
router.post('/:id/recommend', async (req, res) => {
  const { id } = req.params;
  try {
    const merchant = await Merchant.findOne({ merchant_id: id }).lean();
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found', merchant_id: id });
    }

    const aiRes = await axios.post(`${AI_URL()}/recommend/${id}`, {}, { timeout: 30_000 });
    res.status(aiRes.status).json(aiRes.data);
  } catch (err) {
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    console.error('[POST /api/merchants/:id/recommend]', err.message);
    res.status(502).json({ error: 'AI service unavailable', detail: err.message });
  }
});

export default router;
