"""
Unit tests for forecasting/engine.py

All tests use plain Python data — no DB, no network, no FastAPI app.
Run with: pytest ai-service/tests/test_engine.py -v

Tests
-----
1. test_healthy_merchant          — no outflows within horizon, positive balance throughout
2. test_exact_break_even          — balance lands exactly on 0 on the last day (no shortfall)
3. test_genuine_shortfall         — loan EMI drains balance below 0 mid-horizon
4. test_exponential_weighting_effect
                                  — a merchant whose recent same-weekday sales dropped sharply
                                    gets a *lower* expected inflow than a flat average would
                                    produce (explicit numeric assertion)
5. test_multiple_outflows_same_day — EMI and payroll falling on the same day are both deducted
"""

from __future__ import annotations

from datetime import date, timedelta

import pytest

from forecasting.engine import forecast_merchant, _weekday_expected_inflows, ALPHA


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_sales(daily_amount_paise: int, days: int, base_date: date | None = None) -> list[dict]:
    """Return a flat list of daily sales records with a constant amount."""
    if base_date is None:
        base_date = date.today() - timedelta(days=days)
    return [
        {
            "captured_at": (base_date + timedelta(days=i)).isoformat(),
            "amount_paise": daily_amount_paise,
        }
        for i in range(days)
    ]


def make_sales_with_drop(
    high_amount: int,
    low_amount: int,
    high_days: int,
    low_days: int,
    target_weekday: int,
    base_date: date | None = None,
) -> list[dict]:
    """
    Build a sales history where the first ``high_days`` occurrences of
    ``target_weekday`` have ``high_amount`` and the last ``low_days``
    occurrences have ``low_amount``.  Other weekdays are given a small
    constant so they don't interfere with the assertion.
    """
    records: list[dict] = []
    # Walk backwards so we can produce chronological records from oldest to newest
    # We need enough calendar days to fit high_days + low_days occurrences of target_weekday.
    total_target_occurrences = high_days + low_days
    # Find start date: go back far enough
    start = date.today() - timedelta(weeks=total_target_occurrences + 2)
    occurrence_count = 0
    d = start
    while occurrence_count < total_target_occurrences:
        if d.weekday() == target_weekday:
            amount = high_amount if occurrence_count < high_days else low_amount
            occurrence_count += 1
        else:
            amount = 10_000  # small constant for other weekdays
        records.append({"captured_at": d.isoformat(), "amount_paise": amount})
        d += timedelta(days=1)
    return records


# ---------------------------------------------------------------------------
# Test 1: Healthy merchant
# ---------------------------------------------------------------------------

def test_healthy_merchant():
    """
    A merchant with a comfortable balance and modest daily inflow should
    show no shortfall over 14 days, and every projected balance should be
    strictly positive.
    """
    sales = make_sales(daily_amount_paise=50_000_00, days=30)  # ₹50 000/day
    result = forecast_merchant(
        sales_history=sales,
        current_balance_paise=500_000_00,  # ₹5 00 000 opening
        loan={},
        payroll={},
        horizon_days=14,
    )

    assert result["shortfall_detected"] is False
    assert result["shortfall_date"] is None
    assert result["shortfall_amount_paise"] == 0
    assert len(result["daily_projected_balance"]) == 14
    for entry in result["daily_projected_balance"]:
        assert entry["balance_paise"] > 0, f"Unexpectedly non-positive on {entry['date']}"


# ---------------------------------------------------------------------------
# Test 2: Exact break-even (balance reaches exactly 0)
# ---------------------------------------------------------------------------

def test_exact_break_even():
    """
    Engineer a scenario where the balance is driven to exactly 0 on the
    last projected day but never goes negative.  No shortfall should be
    flagged.

    Strategy: current_balance = horizon * daily_outflow, daily_inflow = 0,
    no scheduled single-day outflows — just a flat daily outflow baked into
    payroll on the last day... actually easier: zero inflow, one big payroll
    on the last day that equals the current balance exactly.
    """
    horizon = 7
    opening_balance = 200_000_00  # ₹2 00 000

    last_day = (date.today() + timedelta(days=horizon)).isoformat()

    result = forecast_merchant(
        sales_history=[],           # zero inflow every day
        current_balance_paise=opening_balance,
        loan={},
        payroll={
            "total_salary_paise": opening_balance,
            "pay_date": last_day,
        },
        horizon_days=horizon,
    )

    # Balance on the last day: 200_000_00 + 0 - 200_000_00 = 0 → no shortfall
    assert result["shortfall_detected"] is False
    assert result["daily_projected_balance"][-1]["balance_paise"] == 0


# ---------------------------------------------------------------------------
# Test 3: Genuine shortfall (loan EMI causes negative balance)
# ---------------------------------------------------------------------------

def test_genuine_shortfall():
    """
    A merchant with a thin balance who has a large loan EMI due in 5 days
    should have a shortfall detected on that EMI date.
    """
    horizon = 14
    opening_balance = 100_000_00   # ₹1 00 000
    emi_amount = 150_000_00        # ₹1 50 000 (more than the balance)
    emi_date = (date.today() + timedelta(days=5)).isoformat()

    # Small daily inflow — not enough to cover the EMI
    sales = make_sales(daily_amount_paise=1_000_00, days=30)  # ₹1 000/day

    result = forecast_merchant(
        sales_history=sales,
        current_balance_paise=opening_balance,
        loan={
            "emi_amount_paise": emi_amount,
            "emi_due_date": emi_date,
        },
        payroll={},
        horizon_days=horizon,
    )

    assert result["shortfall_detected"] is True
    assert result["shortfall_date"] == emi_date
    assert result["shortfall_amount_paise"] > 0

    # Verify the shortfall day entry is indeed negative
    shortfall_entry = next(
        e for e in result["daily_projected_balance"] if e["date"] == emi_date
    )
    assert shortfall_entry["balance_paise"] < 0


# ---------------------------------------------------------------------------
# Test 4: Exponential weighting produces lower inflow than flat average
#         when recent same-weekday sales dropped sharply
# ---------------------------------------------------------------------------

def test_exponential_weighting_effect():
    """
    Build a sales history for a single weekday where the first N occurrences
    are high and the last M occurrences are low.

    The exponentially weighted average must be strictly *lower* than the
    flat (unweighted) average because recent (lower) values have higher
    weight.  We assert this numerically to prove the weighting is behaving
    as intended.
    """
    TARGET_WD = 1  # Tuesday (arbitrary)
    HIGH = 100_000_00  # ₹1 00 000
    LOW  =  10_000_00  # ₹10 000
    HIGH_DAYS = 5
    LOW_DAYS  = 3

    # Flat average of all same-weekday observations
    flat_avg = (HIGH * HIGH_DAYS + LOW * LOW_DAYS) / (HIGH_DAYS + LOW_DAYS)

    sales = make_sales_with_drop(
        high_amount=HIGH,
        low_amount=LOW,
        high_days=HIGH_DAYS,
        low_days=LOW_DAYS,
        target_weekday=TARGET_WD,
    )

    # Aggregate to daily totals then compute per-weekday expected inflows
    from forecasting.engine import _aggregate_daily
    daily = _aggregate_daily(sales)
    inflow_by_wd = _weekday_expected_inflows(daily)

    ew_avg = inflow_by_wd[TARGET_WD]

    assert ew_avg < flat_avg, (
        f"Exponentially weighted average ({ew_avg}) should be strictly less than "
        f"flat average ({flat_avg:.0f}) because recent same-weekday sales dropped sharply. "
        f"Check that ALPHA={ALPHA} weights are applied oldest→newest (most recent = highest weight)."
    )


# ---------------------------------------------------------------------------
# Test 5: Both EMI and payroll on the same day are both deducted
# ---------------------------------------------------------------------------

def test_multiple_outflows_same_day():
    """
    When the loan EMI and payroll pay_date fall on the exact same day,
    both outflows must be subtracted on that day.
    """
    horizon = 7
    opening_balance = 500_000_00   # ₹5 00 000
    emi_amount     = 100_000_00    # ₹1 00 000
    salary_amount  = 200_000_00    # ₹2 00 000
    outflow_day    = (date.today() + timedelta(days=3)).isoformat()

    # Zero inflow to make arithmetic simple
    result = forecast_merchant(
        sales_history=[],
        current_balance_paise=opening_balance,
        loan={"emi_amount_paise": emi_amount, "emi_due_date": outflow_day},
        payroll={"total_salary_paise": salary_amount, "pay_date": outflow_day},
        horizon_days=horizon,
    )

    # Find the outflow day entry
    outflow_entry = next(
        e for e in result["daily_projected_balance"] if e["date"] == outflow_day
    )

    expected_balance = opening_balance - emi_amount - salary_amount
    assert outflow_entry["balance_paise"] == expected_balance, (
        f"Expected balance {expected_balance} after both EMI + payroll, "
        f"got {outflow_entry['balance_paise']}"
    )

    # Still positive in this case — no shortfall
    assert result["shortfall_detected"] is False
