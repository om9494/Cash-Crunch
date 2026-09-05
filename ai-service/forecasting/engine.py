"""
Forecasting engine for Cash Crunch Autopilot.

Model choice rationale
----------------------
We use a seasonal-naive baseline with exponential recency weighting
(one independent smoother per weekday). This is a deliberate choice:

  - With only ~60 days of history per merchant, heavier models (ARIMA,
    Prophet, gradient boosting) would overfit the noise and lose
    explainability — exactly the wrong tradeoff for a merchant-facing
    product where the model must defend its numbers live.
  - Exponential smoothing per weekday is simple, auditable, and well-suited
    to the dominant seasonal pattern in retail/SMB sales (day-of-week effects).
  - Each weekday's expected inflow can be shown directly in the UI ("your
    typical Tuesday is ₹X"), making the forecast self-explanatory.

References: Hyndman & Athanasopoulos, "Forecasting: Principles and Practice"
§7.1 (simple exponential smoothing) applied per-weekday as a seasonal decomp.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional


# ---------------------------------------------------------------------------
# Exponential-weighting helpers
# ---------------------------------------------------------------------------

ALPHA = 0.3  # decay factor: more recent same-weekday observation → higher weight


def _weekday_expected_inflows(sales_history: list[dict]) -> dict[int, int]:
    """
    Compute an exponentially weighted average daily inflow for each weekday
    (0 = Monday … 6 = Sunday).

    Within each weekday bucket we iterate from oldest → newest so the *most
    recent* occurrence receives the highest weight.  Weight for observation i
    (0-indexed from oldest) in a bucket of size n is:

        w_i = alpha * (1 - alpha)^(n - 1 - i)

    which gives w_{n-1} (the newest) = alpha, w_{n-2} = alpha*(1-alpha), etc.
    The weights are then normalised to sum to 1 to avoid systematic bias when
    bucket sizes differ across weekdays.

    This is simple exponential smoothing applied per-weekday — a standard,
    explainable approach for short daily series with a day-of-week seasonal
    pattern.

    Parameters
    ----------
    sales_history:
        List of dicts with at least ``captured_at`` (ISO-8601 date string or
        datetime) and ``amount_paise`` (int).  One dict per *day* of
        aggregated sales (the caller is expected to pre-aggregate by date
        before calling this function — see ``_aggregate_daily``).

    Returns
    -------
    dict mapping weekday int → expected inflow in paise (int, rounded).
    """
    # Group totals by weekday
    buckets: dict[int, list[int]] = {wd: [] for wd in range(7)}

    for row in sales_history:
        raw_date = row.get("captured_at") or row.get("date")
        if raw_date is None:
            continue
        if isinstance(raw_date, str):
            # Accept "YYYY-MM-DD" or full ISO datetime
            raw_date = raw_date[:10]
            d = date.fromisoformat(raw_date)
        elif isinstance(raw_date, datetime):
            d = raw_date.date()
        elif isinstance(raw_date, date):
            d = raw_date
        else:
            continue

        amount = int(row.get("amount_paise", 0))
        buckets[d.weekday()].append(amount)

    result: dict[int, int] = {}
    for wd, amounts in buckets.items():
        if not amounts:
            result[wd] = 0
            continue

        n = len(amounts)
        # Compute unnormalised weights (oldest first)
        weights = [ALPHA * ((1 - ALPHA) ** (n - 1 - i)) for i in range(n)]
        total_w = sum(weights)
        # Normalised weighted average
        weighted_sum = sum(w * a for w, a in zip(weights, amounts))
        result[wd] = round(weighted_sum / total_w)

    return result


def _aggregate_daily(sales_history: list[dict]) -> list[dict]:
    """
    Aggregate raw transaction records to one row per calendar date.

    ``sales_history`` may contain multiple transactions per day (individual
    payment gateway captures).  We sum ``amount_paise`` per date so the
    engine works with one data-point-per-day, which is what the weekday
    smoother expects.
    """
    daily: dict[str, int] = {}
    for row in sales_history:
        raw_date = row.get("captured_at") or row.get("date")
        if raw_date is None:
            continue
        if isinstance(raw_date, str):
            d_str = raw_date[:10]
        elif isinstance(raw_date, datetime):
            d_str = raw_date.date().isoformat()
        elif isinstance(raw_date, date):
            d_str = raw_date.isoformat()
        else:
            continue
        daily[d_str] = daily.get(d_str, 0) + int(row.get("amount_paise", 0))

    return [{"captured_at": d, "amount_paise": v} for d, v in sorted(daily.items())]


# ---------------------------------------------------------------------------
# Main pure function
# ---------------------------------------------------------------------------

def forecast_merchant(
    sales_history: list[dict],
    current_balance_paise: int,
    loan: dict,
    payroll: dict,
    horizon_days: int = 14,
) -> dict:
    """
    Forecast a merchant's cash position over the next ``horizon_days`` days.

    This is a **pure function** — no I/O, no DB calls, no side effects.
    All inputs come from the caller; all outputs are returned in the dict.

    Parameters
    ----------
    sales_history:
        Raw or pre-aggregated sales records.  Each dict needs at minimum:
          - ``captured_at`` or ``date``: ISO-8601 date string / date / datetime
          - ``amount_paise``: int — total sales captured on that day
        Multiple records per day are fine; they will be summed.

    current_balance_paise:
        Today's opening bank balance in paise (integer).

    loan: dict — SYNTHETIC: models Razorpay Capital shape, no public sandbox exists
        Expected keys (all optional — missing → no EMI scheduled):
          - ``emi_amount_paise``: int
          - ``emi_due_date``: "YYYY-MM-DD" string or date

    payroll: dict — SYNTHETIC: models Razorpay Payroll shape, no public sandbox exists
        Expected keys (all optional — missing → no payroll scheduled):
          - ``total_salary_paise``: int
          - ``pay_date``: "YYYY-MM-DD" string or date

    horizon_days:
        Number of calendar days to project forward (default 14).

    Returns
    -------
    dict with keys:
      - ``shortfall_detected`` (bool)
      - ``shortfall_date`` (str "YYYY-MM-DD" or None)
      - ``shortfall_amount_paise`` (int ≥ 0, the gap; 0 if no shortfall)
      - ``daily_projected_balance`` (list of {date: str, balance_paise: int})
      - ``expected_inflow_by_weekday`` (dict mapping "0"…"6" → int paise)
        — the per-weekday expected inflows the engine actually used, so the
          caller / API response can expose the model's own arithmetic.
    """
    # --- 1. Aggregate sales to daily totals, compute per-weekday expected inflows ---
    daily_sales = _aggregate_daily(sales_history)
    inflow_by_wd = _weekday_expected_inflows(daily_sales)

    # --- 2. Parse scheduled outflow dates ---
    today = date.today()

    emi_date: Optional[date] = None
    emi_amount: int = 0
    if loan:
        raw_emi_date = loan.get("emi_due_date")
        raw_emi_amt = loan.get("emi_amount_paise", 0)
        if raw_emi_date and raw_emi_amt:
            if isinstance(raw_emi_date, str):
                emi_date = date.fromisoformat(raw_emi_date[:10])
            elif isinstance(raw_emi_date, date):
                emi_date = raw_emi_date
            emi_amount = int(raw_emi_amt)

    pay_date: Optional[date] = None
    pay_amount: int = 0
    if payroll:
        raw_pay_date = payroll.get("pay_date")
        raw_pay_amt = payroll.get("total_salary_paise", 0)
        if raw_pay_date and raw_pay_amt:
            if isinstance(raw_pay_date, str):
                pay_date = date.fromisoformat(raw_pay_date[:10])
            elif isinstance(raw_pay_date, date):
                pay_date = raw_pay_date
            pay_amount = int(raw_pay_amt)

    # --- 3. Day-by-day balance projection ---
    daily_projected_balance: list[dict] = []
    balance = current_balance_paise

    shortfall_detected = False
    shortfall_date: Optional[str] = None
    shortfall_amount_paise: int = 0

    for offset in range(1, horizon_days + 1):
        projection_date = today + timedelta(days=offset)
        wd = projection_date.weekday()

        inflow = inflow_by_wd.get(wd, 0)

        outflow = 0
        if emi_date and projection_date == emi_date:
            outflow += emi_amount
        if pay_date and projection_date == pay_date:
            outflow += pay_amount

        balance = balance + inflow - outflow

        daily_projected_balance.append(
            {
                "date": projection_date.isoformat(),
                "balance_paise": balance,
            }
        )

        # Detect first shortfall: balance goes negative, OR it was insufficient
        # to cover that day's outflow (i.e. balance before outflow < outflow).
        # We capture the gap as the absolute deficit after applying all flows.
        if not shortfall_detected and balance < 0:
            shortfall_detected = True
            shortfall_date = projection_date.isoformat()
            shortfall_amount_paise = abs(balance)

    return {
        "shortfall_detected": shortfall_detected,
        "shortfall_date": shortfall_date,
        "shortfall_amount_paise": shortfall_amount_paise,
        "daily_projected_balance": daily_projected_balance,
        # Stringify keys so the value serialises cleanly to JSON
        "expected_inflow_by_weekday": {str(k): v for k, v in inflow_by_wd.items()},
    }
