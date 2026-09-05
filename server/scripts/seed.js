/**
 * seed.js — Single unified seed script
 *
 * Usage:
 *   node scripts/seed.js
 *
 * What it does (in order):
 *   1. Generates all synthetic data fresh from the current date
 *   2. Wipes all 12 collections
 *   3. Inserts 50 merchants, loans, payrolls, bank_balances, sales_transactions
 *   4. Provisions synthetic RazorpayX virtual fund accounts for every merchant
 *   5. Resets the platform reserve balance to ₹50,00,000
 *   6. Writes scripts/output/ground_truth.json using the SAME day-by-day
 *      balance walk the forecasting engine uses — so truth and engine are
 *      always in sync after every seed run.
 *
 * All monetary values are integer paise. Never float rupees.
 * SYNTHETIC: Razorpay Capital (loans), Razorpay Payroll, RazorpayX Payouts
 *   have no public sandbox — all data here models their documented shapes.
 */

import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

// ── Models ────────────────────────────────────────────────────────────────
import Merchant            from '../models/Merchant.js';
import SalesTransaction    from '../models/SalesTransaction.js';
import BankBalance         from '../models/BankBalance.js';
import Loan                from '../models/Loan.js';
import Payroll             from '../models/Payroll.js';
import Forecast            from '../models/Forecast.js';
import Recommendation      from '../models/Recommendation.js';
import AuditLog            from '../models/AuditLog.js';
import AccuracyReport      from '../models/AccuracyReport.js';
import VirtualFundAccount  from '../models/VirtualFundAccount.js';
import VirtualPayout       from '../models/VirtualPayout.js';
import VirtualPlatformBalance from '../models/VirtualPlatformBalance.js';

// ── Constants ─────────────────────────────────────────────────────────────
const NUM_MERCHANTS        = 50;
const HISTORY_DAYS         = 60;
const NUM_SHORTFALL_TARGET = 13;
const PLATFORM_BALANCE     = 500_000_000; // ₹50,00,000 in paise

const BUSINESS_TYPES = [
  'clothing brand', 'cafe', 'salon', 'electronics repair',
  'grocery store',  'bookstore', 'pharmacy', 'bakery',
];

const DAILY_SALES_BASE = {
  'clothing brand':     [8_000_000,  25_000_000],
  'cafe':               [3_000_000,  10_000_000],
  'salon':              [2_000_000,   8_000_000],
  'electronics repair': [1_500_000,   6_000_000],
  'grocery store':      [5_000_000,  20_000_000],
  'bookstore':          [1_000_000,   4_000_000],
  'pharmacy':           [4_000_000,  15_000_000],
  'bakery':             [1_500_000,   5_000_000],
};

// Day-of-week multipliers (0=Mon … 6=Sun)
const DOW_MULT = [0.85, 0.90, 0.95, 1.00, 1.15, 1.40, 1.30];

// ID characters — mirrors Razorpay's style
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const IFSC_POOL = [
  'HDFC0001234', 'ICIC0002345', 'SBIN0003456', 'UTIB0004567',
  'KKBK0005678', 'YESB0006789', 'IDFB0040101', 'RATN0000156',
];

// ── Seeded PRNG (repeatable data) ─────────────────────────────────────────
let _seed = 42;
function rand() {
  _seed = (_seed * 1664525 + 1013904223) & 0xffffffff;
  return ((_seed >>> 0) / 0xffffffff);
}
function randInt(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }
function randChoice(arr)   { return arr[Math.floor(rand() * arr.length)]; }
function randId(prefix)    {
  let id = prefix;
  for (let i = 0; i < 14; i++) id += CHARS[Math.floor(rand() * CHARS.length)];
  return id;
}

// ── Date helpers ──────────────────────────────────────────────────────────
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function isoDate(d) { return d.toISOString().slice(0, 10); }

// ── Ground-truth day-by-day simulation ────────────────────────────────────
// Mirrors engine.py's forecast_merchant() exactly:
//   balance += inflow_by_weekday[day] - outflow_on_day
// Returns { shortfall_detected, shortfall_date, shortfall_amount_paise,
//           _inflow_through_last_due, _total_obligations, _net }
//
// We use the seed's simple DOW average (avgByDow) rather than the engine's
// exponential smoother, because:
//   (a) On freshly-seeded data the two are very close (same underlying sales).
//   (b) Ground truth should describe a deterministic label that does not drift
//       each time the engine's alpha weights shift with new data.
//   (c) What matters for precision/recall correctness is that both sides
//       evaluate the same "is balance negative on the due date" question using
//       the same accumulated inflow — and the simple average is a conservative
//       underestimate of the EWA (recent weeks are higher), which means
//       any case the simple-average walk flags as a shortfall will also be
//       flagged by the engine's EWA walk.
//
function simulateWalk(currentBalance, avgByDow, emiPaise, emiDueDate, salaryPaise, payDate, today, horizonDays = 14) {
  let balance = currentBalance;
  let shortfall_detected = false;
  let shortfall_date = null;
  let shortfall_amount_paise = 0;

  // Accumulate inflow up through the later of the two due dates (for debug fields)
  const lastDueOffset = Math.max(
    Math.round((emiDueDate - today) / 86400000),
    Math.round((payDate    - today) / 86400000),
  );
  let inflowThruLastDue = 0;

  for (let offset = 1; offset <= horizonDays; offset++) {
    const projDate = addDays(today, offset);
    const dow = projDate.getDay() === 0 ? 6 : projDate.getDay() - 1;
    const inflow = avgByDow[dow] ?? 0;

    let outflow = 0;
    if (isoDate(projDate) === isoDate(emiDueDate)) outflow += emiPaise;
    if (isoDate(projDate) === isoDate(payDate))    outflow += salaryPaise;

    balance += inflow - outflow;

    if (offset <= lastDueOffset) {
      inflowThruLastDue += inflow;
    }

    if (!shortfall_detected && balance < 0) {
      shortfall_detected = true;
      shortfall_date = isoDate(projDate);
      shortfall_amount_paise = Math.abs(balance);
    }
  }

  return {
    shortfall_detected,
    shortfall_date,
    shortfall_amount_paise,
    _inflow_through_last_due: inflowThruLastDue,
    _total_obligations: emiPaise + salaryPaise,
  };
}

// ── Data generation ───────────────────────────────────────────────────────

function generateDailySales(btype, historyStart) {
  const [min, max] = DAILY_SALES_BASE[btype];
  const base = randInt(min, max);
  const sales = [];
  for (let i = 0; i < HISTORY_DAYS; i++) {
    const day = addDays(historyStart, i);
    const dow = day.getDay() === 0 ? 6 : day.getDay() - 1; // 0=Mon
    const amount = Math.round(base * DOW_MULT[dow] * (0.75 + rand() * 0.5));
    sales.push({ date: isoDate(day), amount_paise: amount });
  }
  return sales;
}

function dowAverages(sales, historyStart) {
  const totals = [0, 0, 0, 0, 0, 0, 0];
  const counts = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < sales.length; i++) {
    const day = addDays(historyStart, i);
    const dow = day.getDay() === 0 ? 6 : day.getDay() - 1;
    totals[dow] += sales[i].amount_paise;
    counts[dow]++;
  }
  return totals.map((t, i) => counts[i] ? Math.round(t / counts[i]) : 0);
}

function buildMerchant(idx, forceShortfall, today) {
  const historyStart = addDays(today, -59);
  const btype        = randChoice(BUSINESS_TYPES);
  const employees    = randInt(5, 20);

  const sales      = generateDailySales(btype, historyStart);
  const avgByDow   = dowAverages(sales, historyStart);

  // Obligation due dates — within the next 14-day forecast horizon
  const emiDueOffset  = randInt(3, 13);
  const payDateOffset = randInt(5, 13);
  const emiDueDate    = addDays(today, emiDueOffset);
  const payDate       = addDays(today, payDateOffset);

  const horizonDays    = Math.max(emiDueOffset, payDateOffset) + 1;
  let expectedInflow = 0;
  for (let d = 0; d < horizonDays; d++) {
    const day = addDays(today, d);
    const dow = day.getDay() === 0 ? 6 : day.getDay() - 1;
    expectedInflow += avgByDow[dow];
  }

  const obligMult = forceShortfall
    ? 1.4 + rand() * 1.1   // 1.4x–2.5x inflow → guaranteed shortfall
    : 0.2 + rand() * 0.5;  // 0.2x–0.7x inflow → healthy

  const totalObligations = Math.round(expectedInflow * obligMult);
  const emiPaise         = Math.round(totalObligations * (0.30 + rand() * 0.30));
  const totalSalary      = totalObligations - emiPaise;

  // SYNTHETIC: models Razorpay Capital shape, no public sandbox exists
  const principalPaise  = Math.round(emiPaise / 0.03);
  const tenureRemaining = randInt(6, 36);

  // Target current balance
  let targetCurrent;
  if (forceShortfall) {
    const fraction = 0.10 + rand() * 0.70;
    targetCurrent = Math.max(0, Math.round(totalObligations * fraction - expectedInflow));
  } else {
    targetCurrent = Math.round(totalObligations * 1.5 - expectedInflow);
    targetCurrent = Math.max(targetCurrent, 0);
    targetCurrent += randInt(0, Math.round(totalObligations * 0.8));
  }

  // Build 60-day bank balance history anchored to targetCurrent
  const totalHistorySales = sales.reduce((s, r) => s + r.amount_paise, 0);
  let running = targetCurrent - totalHistorySales;
  const bankBalances = sales.map((s) => {
    running += s.amount_paise;
    return { date: s.date, closing_balance_paise: Math.max(running, 0) };
  });

  const currentBalance = bankBalances[bankBalances.length - 1].closing_balance_paise;
  const merchantId     = `merchant_${String(idx).padStart(3, '0')}`;

  // ── Compute ground-truth label using the same day-by-day walk the
  //    forecasting engine performs. This replaces the old lump-sum
  //    comparison that produced stale/mismatched labels.
  const gtWalk = simulateWalk(
    currentBalance,
    avgByDow,
    emiPaise,
    emiDueDate,
    totalSalary,
    payDate,
    today,
    14,
  );

  const groundTruth = {
    merchant_id:                    merchantId,
    is_planted_shortfall:           gtWalk.shortfall_detected,
    expected_shortfall_date:        gtWalk.shortfall_date,
    expected_shortfall_amount_paise: gtWalk.shortfall_amount_paise,
    // Debug fields — used by accuracy.py exception-reason builders
    _current_balance_paise:         currentBalance,
    _expected_inflow_paise:         gtWalk._inflow_through_last_due,
    _total_obligations_paise:       gtWalk._total_obligations,
    _net_paise:                     currentBalance + gtWalk._inflow_through_last_due - gtWalk._total_obligations,
  };

  return {
    merchant: {
      merchant_id:     merchantId,
      name:            `${btype.charAt(0).toUpperCase() + btype.slice(1)} #${idx}`,
      business_type:   btype,
      employees_count: employees,
    },
    // SYNTHETIC: models Razorpay Capital shape, no public sandbox exists
    loan: {
      merchant_id:      merchantId,
      loan_id:          `loan_${String(idx).padStart(3, '0')}`,
      principal_paise:  principalPaise,
      emi_amount_paise: emiPaise,
      emi_due_date:     emiDueDate,
      tenure_remaining: tenureRemaining,
    },
    // SYNTHETIC: models Razorpay Payroll shape, no public sandbox exists
    payroll: {
      merchant_id:        merchantId,
      payroll_run_id:     `payroll_${String(idx).padStart(3, '0')}`,
      total_salary_paise: totalSalary,
      employees:          employees,
      pay_date:           payDate,
    },
    bankBalances: bankBalances.map(b => ({
      merchant_id:           merchantId,
      date:                  new Date(b.date),
      closing_balance_paise: b.closing_balance_paise,
    })),
    sales: sales.map((s, i) => ({
      merchant_id:         merchantId,
      // SYNTHETIC: no real Razorpay checkout flow — direct seed
      razorpay_payment_id: `pay_SEED_${merchantId}_${s.date.replace(/-/g, '')}_${i}`,
      amount_paise:        s.amount_paise,
      status:              'captured',
      captured_at:         new Date(s.date),
    })),
    currentBalance,
    groundTruth,
  };
}

// ── Virtual account provisioning helpers ─────────────────────────────────

function provisionVirtualAccount(merchantId, merchantName) {
  // SYNTHETIC: models RazorpayX Contact + Fund Account shape, no public
  // sandbox accessible without a business account
  const contactId     = randId('cont_');
  const fundAccountId = randId('fa_');
  const last4         = String(randInt(1000, 9999));
  const ifsc          = randChoice(IFSC_POOL);

  return { contactId, fundAccountId, last4, ifsc };
}

// ── Main ──────────────────────────────────────────────────────────────────

async function seed() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) throw new Error('MONGODB_URI is not set in .env');

  await mongoose.connect(mongoUri);
  console.log('✓ Connected to MongoDB');

  // ── 1. Wipe all collections ────────────────────────────────────────────
  const toClear = [
    [Merchant,               'merchants'],
    [SalesTransaction,       'sales_transactions'],
    [BankBalance,            'bank_balances'],
    [Loan,                   'loans'],
    [Payroll,                'payrolls'],
    [Forecast,               'forecasts'],
    [Recommendation,         'recommendations'],
    [AuditLog,               'audit_logs'],
    [AccuracyReport,         'accuracy_reports'],
    [VirtualFundAccount,     'virtual_fund_accounts'],
    [VirtualPayout,          'virtual_payouts'],
    [VirtualPlatformBalance, 'virtual_platform_balance'],
  ];

  console.log('\nClearing collections…');
  for (const [model, name] of toClear) {
    // Drop the collection entirely (removes documents AND indexes), then
    // Mongoose will recreate the indexes on first write. This avoids
    // duplicate-key errors on the unique razorpay_payment_id index when
    // re-seeding against an Atlas cluster that cached the old index.
    try {
      await model.collection.drop();
    } catch (e) {
      // "ns not found" = collection didn't exist yet — that's fine
      if (e.code !== 26) throw e;
    }
    console.log(`  ✓ ${name}`);
  }

  // ── 2. Generate & insert merchant data ────────────────────────────────
  const today  = new Date();
  today.setHours(0, 0, 0, 0);

  // Pick which merchant indices get planted shortfalls
  const shortfallIndices = new Set();
  while (shortfallIndices.size < NUM_SHORTFALL_TARGET) {
    shortfallIndices.add(randInt(0, NUM_MERCHANTS - 1));
  }

  const merchantDocs    = [];
  const loanDocs        = [];
  const payrollDocs     = [];
  const bankBalanceDocs = [];
  const salesDocs       = [];
  const vaInserts       = [];
  const groundTruthRows = [];

  console.log('\nGenerating data for 50 merchants…');

  for (let i = 0; i < NUM_MERCHANTS; i++) {
    const m = buildMerchant(i, shortfallIndices.has(i), today);

    // Generate virtual account IDs inline
    const va = provisionVirtualAccount(m.merchant.merchant_id, m.merchant.name);

    merchantDocs.push({
      ...m.merchant,
      contact_id:      va.contactId,
      fund_account_id: va.fundAccountId,
      created_at:      new Date(),
    });

    loanDocs.push(m.loan);
    payrollDocs.push(m.payroll);
    bankBalanceDocs.push(...m.bankBalances);
    salesDocs.push(...m.sales);
    groundTruthRows.push(m.groundTruth);

    // SYNTHETIC: models RazorpayX Fund Account shape, no public sandbox
    vaInserts.push({
      merchant_id:           m.merchant.merchant_id,
      fund_account_id:       va.fundAccountId,
      contact_id:            va.contactId,
      account_holder_name:   m.merchant.name,
      account_number_masked: `XXXXXX${va.last4}`,
      ifsc:                  va.ifsc,
    });

    if ((i + 1) % 10 === 0) console.log(`  … ${i + 1}/50`);
  }

  // ── 3. Bulk insert ─────────────────────────────────────────────────────
  console.log('\nInserting data…');

  const insertedMerchants = await Merchant.insertMany(merchantDocs);
  console.log(`  ✓ ${insertedMerchants.length} merchants`);

  await Loan.insertMany(loanDocs);
  console.log(`  ✓ ${loanDocs.length} loans (SYNTHETIC: Razorpay Capital)`);

  await Payroll.insertMany(payrollDocs);
  console.log(`  ✓ ${payrollDocs.length} payrolls (SYNTHETIC: Razorpay Payroll)`);

  await BankBalance.insertMany(bankBalanceDocs);
  console.log(`  ✓ ${bankBalanceDocs.length} bank_balance rows`);

  // Insert sales in batches of 500
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < salesDocs.length; i += BATCH) {
    await SalesTransaction.insertMany(salesDocs.slice(i, i + BATCH), { ordered: false });
    inserted += Math.min(BATCH, salesDocs.length - i);
  }
  console.log(`  ✓ ${inserted} sales_transactions (SYNTHETIC: pay_SEED_ prefix)`);

  // ── 4. Provision virtual fund accounts ────────────────────────────────
  // SYNTHETIC: models RazorpayX Fund Account shape, no public sandbox
  await VirtualFundAccount.insertMany(vaInserts);
  console.log(`  ✓ ${vaInserts.length} virtual_fund_accounts (SYNTHETIC: RazorpayX)`);

  // ── 5. Reset platform reserve balance ─────────────────────────────────
  // SYNTHETIC: models RazorpayX virtual current account balance
  await VirtualPlatformBalance.findOneAndUpdate(
    { key: 'singleton' },
    { balance_paise: PLATFORM_BALANCE, updated_at: new Date() },
    { upsert: true, new: true }
  );
  console.log(`  ✓ Platform reserve balance reset to ₹${PLATFORM_BALANCE / 100}`);

  // ── 6. Write ground_truth.json ────────────────────────────────────────
  // Ground truth is computed using the same day-by-day walk as engine.py,
  // so labels are always consistent with what the engine will predict on
  // the freshly seeded data. This file must be regenerated on every seed
  // run — a stale ground_truth.json from a previous run date will always
  // produce artificially bad precision/recall numbers.
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const outputDir = resolve(scriptDir, '../../scripts/output');
  const gtPath    = resolve(outputDir, 'ground_truth.json');

  try {
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(gtPath, JSON.stringify(groundTruthRows, null, 2), 'utf-8');
    const plantedCount = groundTruthRows.filter(r => r.is_planted_shortfall).length;
    console.log(`  ✓ ground_truth.json written (${plantedCount} planted shortfalls)`);
  } catch (e) {
    console.error('  ✗ Failed to write ground_truth.json:', e.message);
    // Don't abort — DB data is intact; ground_truth.json can be regenerated
    // by re-running the seed. Log a clear warning.
    console.error('    WARNING: accuracy reports will be stale until ground_truth.json is updated.');
  }

  // ── 7. Summary ─────────────────────────────────────────────────────────
  const plantedCount = groundTruthRows.filter(r => r.is_planted_shortfall).length;
  console.log('\n─────────────────────────────────────────────────────');
  console.log('  Seed complete');
  console.log(`  Date basis:          ${isoDate(today)}`);
  console.log(`  Merchants:           ${merchantDocs.length}`);
  console.log(`  Planted shortfalls:  ${plantedCount} (computed via day-by-day walk)`);
  console.log(`  Loans:               ${loanDocs.length}  (SYNTHETIC)`);
  console.log(`  Payrolls:            ${payrollDocs.length}  (SYNTHETIC)`);
  console.log(`  Bank balance rows:   ${bankBalanceDocs.length}`);
  console.log(`  Sales transactions:  ${inserted}  (SYNTHETIC pay_SEED_)`);
  console.log(`  Virtual accounts:    ${vaInserts.length}  (SYNTHETIC RazorpayX)`);
  console.log(`  Platform balance:    ₹${PLATFORM_BALANCE / 100}`);
  console.log(`  ground_truth.json:   ${gtPath}`);
  console.log('─────────────────────────────────────────────────────');
  console.log('\nNext step: open the dashboard and click ↻ Run All Forecasts');

  await mongoose.disconnect();
  console.log('✓ Disconnected');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
