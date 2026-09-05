"""
Recommendation agent for Cash Crunch Autopilot.

Governance rule (non-negotiable):
  - This module only generates PROPOSED options. It never calls any Razorpay
    endpoint, never imports anything from server/services/, and never moves money.
  - The sole write this module is responsible for is a recommendations document
    with status="pending". The Express server (server/routes/) is the only layer
    allowed to execute approved actions.

Data honesty:
  - "instant_advance" is modelled against Razorpay's instant settlement product
    but NO public sandbox exists for it. See SYNTHETIC comment on the fee constant.
  - "contact_lender" surfaces a suggestion TO the merchant — the agent does NOT
    claim it can defer an EMI on the merchant's behalf. Razorpay Capital has not
    publicly documented a self-serve EMI deferral API.
"""

from __future__ import annotations

import math
from typing import Optional

# ---------------------------------------------------------------------------
# Fee constants
# ---------------------------------------------------------------------------

# SYNTHETIC fee estimate modeling Razorpay's instant settlement fee
# structure; the payout itself executes via the simulated RazorpayX layer
# (see server/services/razorpayx.js), not a live payout call.
INSTANT_ADVANCE_FEE_PCT: float = 2.0  # percent of advance amount


# ---------------------------------------------------------------------------
# Pure recommendation generator
# ---------------------------------------------------------------------------

def generate_recommendations(
    forecast: dict,
    merchant: dict,
) -> list[dict]:
    """
    Generate 2-3 bounded, cost-labelled remediation options for a merchant
    whose forecast has ``shortfall_detected = True``.

    This is a **pure function** — no I/O, no DB calls, no HTTP calls.
    All inputs come from the caller; all outputs are returned as a list.

    Parameters
    ----------
    forecast : dict
        A forecast document from the ``forecasts`` collection (or the dict
        returned by ``forecasting.engine.forecast_merchant``).  Required keys:
          - ``shortfall_detected`` (bool)
          - ``shortfall_date`` (str "YYYY-MM-DD" or None)
          - ``shortfall_amount_paise`` (int ≥ 0)
          - ``daily_projected_balance`` (list of {date, balance_paise})

    merchant : dict
        A merchant document from the ``merchants`` collection.  Used for
        context in descriptions (e.g. ``name``).  All fields are optional
        for the math; missing fields degrade gracefully.

    Returns
    -------
    list[dict]
        All candidate options considered, sorted by ``cost_paise`` ascending.
        Each option dict has:
          - ``type`` (str)
          - ``description`` (str)
          - ``cost_paise`` (int — always integer paise, never float rupees)
          - ``resulting_balance_paise`` (int)
          - ``recommended`` (bool) — True on the cheapest option that fully
            resolves the shortfall; False on all others.

        Returns an empty list when ``shortfall_detected`` is False, because
        there is nothing to resolve.

    Raises
    ------
    ValueError
        If ``shortfall_detected`` is True but ``shortfall_amount_paise`` is
        missing or non-positive (indicates a malformed forecast document).
    """
    if not forecast.get("shortfall_detected", False):
        return []

    shortfall_amount_paise: int = int(forecast.get("shortfall_amount_paise", 0))
    if shortfall_amount_paise <= 0:
        raise ValueError(
            "shortfall_detected is True but shortfall_amount_paise is "
            f"{shortfall_amount_paise}. Forecast document appears malformed."
        )

    shortfall_date: Optional[str] = forecast.get("shortfall_date")

    # Current balance just before the shortfall day — we need it to compute
    # resulting_balance_paise correctly for each option.
    # The easiest proxy: the day *before* the shortfall day in the projection,
    # or current_balance if the shortfall is on day 1.
    _balance_before_shortfall: int = _balance_on_day_before(
        forecast.get("daily_projected_balance", []),
        shortfall_date,
        fallback=shortfall_amount_paise,  # worst-case: assume balance was exactly 0+gap
    )

    options: list[dict] = []

    # ------------------------------------------------------------------
    # Option 1 — instant_advance
    # SYNTHETIC: models Razorpay's instant settlement advance product.
    # No public sandbox; see INSTANT_ADVANCE_FEE_PCT constant above.
    # The payout, if approved, executes via the simulated RazorpayX layer
    # in server/services/razorpayx.js — NOT here.
    # ------------------------------------------------------------------
    # Size the advance so the NET proceeds (after fee) cover the shortfall
    # exactly, landing at a resulting balance of 0 or slightly above.
    #
    # Derivation:
    #   net_advance = advance_amount * (1 - fee_pct/100)
    #   We need: balance_before_shortfall + net_advance - outflow = 0
    #   And:     balance_before_shortfall - outflow = -shortfall_amount  (by definition)
    #   So:      net_advance = shortfall_amount
    #   Therefore: advance_amount = shortfall_amount / (1 - fee_pct/100)
    #
    # This ensures the merchant's balance reaches exactly 0 after the outflow.
    fee_multiplier: float = 1.0 - (INSTANT_ADVANCE_FEE_PCT / 100.0)
    advance_amount_paise: int = math.ceil(shortfall_amount_paise / fee_multiplier)
    fee_paise: int = advance_amount_paise - shortfall_amount_paise  # exact fee = gross - net
    net_advance_paise: int = shortfall_amount_paise  # net always equals the shortfall gap
    resulting_balance_instant: int = _balance_before_shortfall + net_advance_paise

    options.append(
        {
            "type": "instant_advance",
            # SYNTHETIC: models Razorpay Capital shape, no public sandbox exists
            "description": (
                f"Draw an instant advance of ₹{_paise_to_rupee_str(advance_amount_paise)} "
                f"against tomorrow's expected sales to fully cover the projected shortfall "
                f"on {shortfall_date}. "
                f"A {INSTANT_ADVANCE_FEE_PCT:.0f}% fee "
                f"(₹{_paise_to_rupee_str(fee_paise)}) is charged; "
                f"net proceeds of ₹{_paise_to_rupee_str(net_advance_paise)} bridge the gap exactly."
            ),
            "cost_paise": fee_paise,
            # Store the GROSS advance so the payout layer disburses the right amount
            "advance_amount_paise": advance_amount_paise,
            "resulting_balance_paise": resulting_balance_instant,
            "recommended": False,  # set below after sorting
        }
    )

    # ------------------------------------------------------------------
    # Option 2 — alert_only
    # Zero cost. Surfaces the exact shortfall date and amount so the
    # merchant can arrange funds themselves.
    # ------------------------------------------------------------------
    options.append(
        {
            "type": "alert_only",
            "description": (
                f"No automated action. Your account is projected to run short by "
                f"₹{_paise_to_rupee_str(shortfall_amount_paise)} on {shortfall_date}. "
                f"Please arrange additional funds before that date to avoid a failed "
                f"payroll run."
            ),
            "cost_paise": 0,
            # alert_only does not add funds — balance stays at the shortfall value
            "resulting_balance_paise": _balance_before_shortfall - shortfall_amount_paise,
            "recommended": False,
        }
    )

    # ------------------------------------------------------------------
    # Option 3 — contact_lender
    # Zero cost. A SUGGESTION to the merchant — NOT an automated deferral.
    # Razorpay Capital has not publicly documented a self-serve EMI deferral
    # API; we must not claim the agent can do this itself.
    # SYNTHETIC: models Razorpay Capital shape, no public sandbox exists.
    # ------------------------------------------------------------------
    options.append(
        {
            "type": "contact_lender",
            # SYNTHETIC: models Razorpay Capital shape, no public sandbox exists
            "description": (
                f"Consider reaching out to Razorpay Capital to discuss your upcoming EMI "
                f"in the context of this projected shortfall on {shortfall_date}. "
                f"This is a suggestion for you to explore directly with your lender — "
                f"the system cannot defer or reschedule your EMI on your behalf."
            ),
            "cost_paise": 0,
            # Contact only — balance is unchanged (shortfall is still present)
            "resulting_balance_paise": _balance_before_shortfall - shortfall_amount_paise,
            "recommended": False,
        }
    )

    # ------------------------------------------------------------------
    # Sort ascending by cost, then mark the cheapest option that FULLY
    # resolves the shortfall (resulting_balance_paise ≥ 0) as recommended.
    #
    # Important: zero-cost options that do NOT add funds (alert_only,
    # contact_lender) must never be marked recommended even if the
    # balance arithmetic happens to come out ≥ 0 due to the pre-shortfall
    # balance being large.  We exclude these informational-only types
    # from the "resolves" check — only options that actually inject money
    # (instant_advance and any future draw/advance types) qualify.
    # ------------------------------------------------------------------
    options.sort(key=lambda o: o["cost_paise"])

    # Types that inject funds and therefore can genuinely resolve the shortfall
    _RESOLVES_SHORTFALL = {"instant_advance", "draw_credit_line", "partial_draw"}

    for opt in options:
        if opt["type"] in _RESOLVES_SHORTFALL and opt["resulting_balance_paise"] >= 0:
            opt["recommended"] = True
            break  # only the cheapest qualifying option gets the flag

    return options


# ---------------------------------------------------------------------------
# Private helpers (pure math, no I/O)
# ---------------------------------------------------------------------------

def _compute_fee(amount_paise: int, fee_pct: float) -> int:
    """Return the integer-paise fee for a given amount and percentage."""
    return round(amount_paise * fee_pct / 100)


def _balance_on_day_before(
    daily_projected_balance: list[dict],
    shortfall_date: Optional[str],
    fallback: int,
) -> int:
    """
    Return the projected balance on the day immediately before ``shortfall_date``.

    If the shortfall is on the first projected day, or the list is empty,
    return ``fallback``.
    """
    if not daily_projected_balance or shortfall_date is None:
        return fallback

    for i, row in enumerate(daily_projected_balance):
        if row.get("date") == shortfall_date:
            if i == 0:
                return fallback
            return int(daily_projected_balance[i - 1]["balance_paise"])

    return fallback


def _paise_to_rupee_str(paise: int) -> str:
    """
    Format paise as a human-readable rupee string for use in description text.

    This is the ONLY place in the AI service that converts paise to rupees,
    and it is used solely for the free-text ``description`` field — all numeric
    fields (cost_paise, resulting_balance_paise) remain integer paise.
    """
    rupees = paise / 100
    if rupees == int(rupees):
        return f"{int(rupees):,}"
    return f"{rupees:,.2f}"
