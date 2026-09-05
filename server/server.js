import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import morgan from 'morgan';

import merchantsRouter      from './routes/merchants.js';
import recommendationsRouter from './routes/recommendations.js';
import accuracyRouter       from './routes/accuracy.js';
import virtualAccountsRouter from './routes/virtualAccounts.js';
import payoutsRouter        from './routes/payouts.js';
import adminRouter          from './routes/admin.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Allow one or more origins via CLIENT_URL (comma-separated for multi-origin).
// Falls back to the local Vite dev server if the env var is not set.
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no Origin header (e.g. same-origin, curl, Postman).
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin '${origin}' not allowed`));
      }
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(morgan('dev'));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/merchants',       merchantsRouter);
app.use('/api/recommendations', recommendationsRouter);
app.use('/api/accuracy-report', accuracyRouter);
app.use('/api/payouts',         payoutsRouter);
app.use('/api/admin',           adminRouter);
// virtualAccounts handles both /api/merchants/:id/virtual-account
// and /api/platform-balance — mounted at /api so full paths resolve
app.use('/api',                 virtualAccountsRouter);

// ── Global error handler — never let a stack trace reach the client ───────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

async function start() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not set');
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
