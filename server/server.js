import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import morgan from 'morgan';

import merchantsRouter      from './routes/merchants.js';
import recommendationsRouter from './routes/recommendations.js';
import accuracyRouter       from './routes/accuracy.js';
import virtualAccountsRouter from './routes/virtualAccounts.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
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
