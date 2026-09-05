"""
Accuracy reporting for the Cash Crunch Autopilot forecasting engine.

This module compares fresh forecast results against planted ground-truth
shortfalls to produce precision, recall, and a per-mismatch exception list.

All math is pure — no I/O, no DB calls, no HTTP calls.
The FastAPI route in main.py owns the data-loading and persistence.
"""

from __future__ import annotations

from typing import Optional


# ---------------------------------------------------------------------------
# Rupee formatting helper (description text only — all stored values stay paise)
# ---------------------------------------------------------------------------

def _fmt(paise: int) -> str:
    """Format integer paise as a human-readable ₹ string (for exception reasons)."""
    rupees = paise / 100
    return f"₹{rupees:,.0f}" if rupees == int(rupees) else f"₹{rupees:,.2f}"


# ---------------------------------------------------------------------------
# Core pure function
# ---------------------------------------------------------------------------

def build_accuracy_report(
    forecasts: list[dict],
    ground_truth: list[dict],
) -> dict:
    """
    Compare each merchant's fresh forecast against the planted ground truth and
    return a complete accuracy report dict.

    Parameters
    ----------
    forecasts : list[dict]
        One dict per merchant, as returned by ``forecast_merchant()`` (plus a
        ``merchant_id`` key added by the caller).  Required keys per item:
          - ``merchant_id`` (str)
          - ``shortfall_detected`` (bool)
          - ``shortfall_date`` (str "YYYY-MM-DD" or None)
          - ``shortfall_amount_paise`` (int)

    ground_truth : list[dict]
        Contents of scripts/output/ground_truth.json.  Required keys per item:
          - ``merchant_id`` (str)
          - ``is_planted_shortfall`` (bool)
          - ``expected_shortfall_date`` (str "YYYY-MM-DD" or None)
          - ``expected_shortfall_amount_paise`` (int)

    Returns
    -------
    dict with keys matching the ``accuracy_reports`` collection schema:
      - ``total_merchants``    (int)
      - ``planted_shortfalls`` (int)  — ground-truth positive count
      - ``correctly_flagged``  (int)  — true positives
      - ``missed``             (int)  — false negatives
      - ``false_alarms``       (int)  — false positives
      - ``precision``          (float 0–1)
      - ``recall``             (float 0–1)
      - ``exceptions``         (list[dict])  — one entry per mismatch:
                                { merchant_id: str, reason: str }
    """
    # Index ground truth by merchant_id for O(1) lookup.
    gt_index: dict[str, dict] = {row["merchant_id"]: row for row in ground_truth}

    correctly_flagged: int = 0  # TP
    missed: int = 0             # FN
    false_alarms: int = 0       # FP
    exceptions: list[dict] = []

    for fc in forecasts:
        mid: str = fc["merchant_id"]
        gt: Optional[dict] = gt_index.get(mid)

        if gt is None:
            # Merchant in forecasts but not in ground truth — skip silently.
            continue

        predicted_shortfall: bool = bool(fc.get("shortfall_detected", False))
        actual_shortfall: bool = bool(gt.get("is_planted_shortfall", False))

        if actual_shortfall and predicted_shortfall:
            # True positive — check whether the date and amount are close,
            # and surface a reason if they diverge significantly.
            correctly_flagged += 1
            reason = _tp_divergence_reason(fc, gt)
            if reason:
                exceptions.append({"merchant_id": mid, "reason": reason})

        elif actual_shortfall and not predicted_shortfall:
            # False negative — engine missed a real shortfall.
            missed += 1
            exceptions.append(
                {
                    "merchant_id": mid,
                    "reason": _fn_reason(fc, gt),
                }
            )

        elif not actual_shortfall and predicted_shortfall:
            # False positive — engine raised an alarm where none was planted.
            false_alarms += 1
            exceptions.append(
                {
                    "merchant_id": mid,
                    "reason": _fp_reason(fc, gt),
                }
            )
        # True negative: no action needed.

    planted_shortfalls: int = sum(
        1 for row in ground_truth if row.get("is_planted_shortfall", False)
    )
    total_merchants: int = len(
        [fc for fc in forecasts if fc["merchant_id"] in gt_index]
    )

    predicted_positives: int = correctly_flagged + false_alarms
    precision: float = (
        correctly_flagged / predicted_positives if predicted_positives > 0 else 0.0
    )
    recall: float = (
        correctly_flagged / planted_shortfalls if planted_shortfalls > 0 else 0.0
    )

    return {
        "total_merchants": total_merchants,
        "planted_shortfalls": planted_shortfalls,
        "correctly_flagged": correctly_flagged,
        "missed": missed,
        "false_alarms": false_alarms,
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "exceptions": exceptions,
    }


# ---------------------------------------------------------------------------
# Private exception-reason builders (pure text, all comparisons in paise)
# ---------------------------------------------------------------------------

# Thresholds for "close enough" — differences smaller than these are not
# surfaced as exceptions even on true-positive hits.
_DATE_TOLERANCE_DAYS: int = 2          # ±2 calendar days
_AMOUNT_TOLERANCE_PCT: float = 20.0    # ±20% of ground-truth amount


def _tp_divergence_reason(fc: dict, gt: dict) -> Optional[str]:
    """
    For a true positive, return a plain-English reason string if the predicted
    shortfall date or amount diverges materially from ground truth; else None.
    """
    parts: list[str] = []

    # --- Date divergence ---
    pred_date: Optional[str] = fc.get("shortfall_date")
    gt_date: Optional[str] = gt.get("expected_shortfall_date")
    if pred_date and gt_date and pred_date != gt_date:
        from datetime import date
        try:
            delta = abs((date.fromisoformat(pred_date) - date.fromisoformat(gt_date)).days)
            if delta > _DATE_TOLERANCE_DAYS:
                parts.append(
                    f"shortfall date predicted as {pred_date} but ground truth is "
                    f"{gt_date} ({delta} day{'s' if delta != 1 else ''} off)"
                )
        except ValueError:
            pass

    # --- Amount divergence ---
    pred_amt: int = int(fc.get("shortfall_amount_paise", 0))
    gt_amt: int = int(gt.get("expected_shortfall_amount_paise", 0))
    if gt_amt > 0:
        pct_diff = abs(pred_amt - gt_amt) / gt_amt * 100
        if pct_diff > _AMOUNT_TOLERANCE_PCT:
            direction = "over" if pred_amt > gt_amt else "under"
            parts.append(
                f"shortfall amount predicted as {_fmt(pred_amt)} but ground truth is "
                f"{_fmt(gt_amt)} ({pct_diff:.0f}% {direction}-estimate)"
            )

    if not parts:
        return None

    return "True positive but: " + "; ".join(parts) + "."


def _fn_reason(fc: dict, gt: dict) -> str:
    """
    Plain-English reason why the engine missed a planted shortfall.

    We look at the ground-truth debug fields (_current_balance_paise,
    _expected_inflow_paise, _total_obligations_paise) to explain what
    the engine likely saw that made it feel safe.
    """
    gt_date: str = gt.get("expected_shortfall_date") or "within the forecast window"
    gt_amt: int = int(gt.get("expected_shortfall_amount_paise", 0))

    current_balance: int = int(gt.get("_current_balance_paise", 0))
    expected_inflow: int = int(gt.get("_expected_inflow_paise", 0))
    obligations: int = int(gt.get("_total_obligations_paise", 0))

    # Most common cause: engine sees high average inflows that mask the lump-sum
    # obligation on a single day.
    if expected_inflow > 0:
        pct_covered = expected_inflow / obligations * 100 if obligations > 0 else 0
        return (
            f"Missed shortfall of {_fmt(gt_amt)} expected on {gt_date}. "
            f"Opening balance was {_fmt(current_balance)} and ground-truth expected "
            f"inflows of {_fmt(expected_inflow)} covered {pct_covered:.0f}% of "
            f"obligations ({_fmt(obligations)}); the engine's weekday-smoothed inflow "
            f"estimates likely spread the obligations across the window rather than "
            f"concentrating them on a single payment date."
        )

    return (
        f"Missed shortfall of {_fmt(gt_amt)} expected on {gt_date}. "
        f"Opening balance was {_fmt(current_balance)}; obligations totalled "
        f"{_fmt(obligations)}. The engine did not detect a negative balance "
        f"within the 14-day horizon, possibly because the pay date or EMI date "
        f"falls outside the projection window."
    )


def _fp_reason(fc: dict, gt: dict) -> str:
    """
    Plain-English reason why the engine raised a false alarm.

    We compare the engine's projected shortfall against the ground-truth
    'safe' markers to explain the over-trigger.
    """
    pred_date: str = fc.get("shortfall_date") or "an unknown date"
    pred_amt: int = int(fc.get("shortfall_amount_paise", 0))

    current_balance: int = int(gt.get("_current_balance_paise", 0))
    expected_inflow: int = int(gt.get("_expected_inflow_paise", 0))
    obligations: int = int(gt.get("_total_obligations_paise", 0))
    net: int = int(gt.get("_net_paise", 0))

    return (
        f"False alarm: engine predicted a shortfall of {_fmt(pred_amt)} on "
        f"{pred_date}, but no shortfall was planted. "
        f"Ground truth shows net position of {_fmt(net)} "
        f"(opening {_fmt(current_balance)} + inflows {_fmt(expected_inflow)} "
        f"− obligations {_fmt(obligations)}). "
        f"The engine's weekday-smoothed inflow model may have under-estimated "
        f"expected sales for this merchant, making the balance appear negative "
        f"when it should remain positive."
    )
