"""
Cash Crunch Autopilot — AI Service
FastAPI entry point.

DB access is read-only for all source collections (merchants, sales_transactions,
bank_balance, loans, payroll).  The only writes are:
  - forecasts collection  (POST /forecast/* routes)
  - recommendations collection  (POST /recommend/{merchant_id})

Governance rule (non-negotiable):
  This service NEVER calls a Razorpay payout endpoint and NEVER imports or
  calls anything from server/services/. All recommendations are written with
  status="pending". The Express server is the only layer that executes approved
  money-moving actions, and only after a human approves via the dashboard.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pymongo import MongoClient
from pymongo.collection import Collection

from forecasting.engine import forecast_merchant
from recommendations.agent import generate_recommendations
from reporting.accuracy import build_accuracy_report

# ---------------------------------------------------------------------------
# Config / DB setup
# ---------------------------------------------------------------------------

load_dotenv()

MONGODB_URI: str = os.getenv("MONGODB_URI", "mongodb://127.0.0.1:27017/cash_crunch_autopilot")

_mongo_client: Optional[MongoClient] = None


def get_db():
    """Return the MongoDB database, creating the client lazily.

    The Atlas SRV URI has the form:
      mongodb+srv://user:pass@cluster.../? appName=...
    which has no database name in the path, so rsplit("/") gives "".
    We fall back to the env var MONGODB_DB_NAME, then to the hardcoded
    app default "cash_crunch_autopilot".
    """
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = MongoClient(MONGODB_URI)
    # Try to parse from URI path first (works for local URIs like
    # mongodb://localhost:27017/cash_crunch_autopilot)
    raw = MONGODB_URI.rsplit("/", 1)[-1].split("?")[0].strip()
    db_name = raw if raw else os.getenv("MONGODB_DB_NAME", "cash_crunch_autopilot")
    return _mongo_client[db_name]


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="Cash Crunch Autopilot — AI Service")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Helpers: load merchant data from Mongo
# ---------------------------------------------------------------------------

def _load_merchant_inputs(merchant_id: str) -> dict:
    """
    Pull all data required by forecast_merchant() for a single merchant.

    Returns a dict with keys: sales_history, current_balance_paise, loan, payroll.
    Raises HTTPException(404) if the merchant does not exist.
    """
    db = get_db()

    # Verify merchant exists.
    # Mongoose stores merchants with an ObjectId _id and a separate merchant_id
    # field (e.g. "merchant_001").  All related collections (sales, bank balance,
    # loans, payroll) use the merchant_id string field for foreign keys, so we
    # resolve to that string first, then use it for every subsequent query.
    merchant = db.merchants.find_one({"merchant_id": merchant_id})
    if merchant is None:
        # Fallback: caller may have passed an ObjectId string
        from bson import ObjectId
        try:
            merchant = db.merchants.find_one({"_id": ObjectId(merchant_id)})
        except Exception:
            pass
    if merchant is None:
        raise HTTPException(status_code=404, detail=f"Merchant '{merchant_id}' not found")

    # Resolve the canonical merchant_id string (always use the merchant_id field,
    # not the ObjectId, so it matches foreign keys in all related collections).
    canonical_mid: str = merchant.get("merchant_id", merchant_id)

    # Sales history — Mongoose pluralises + lowercases "SalesTransaction" model
    # to "salestransactions" (no underscore). Always query this exact name.
    raw_sales = list(
        db.salestransactions.find(
            {"merchant_id": canonical_mid, "status": "captured"},
            {"_id": 0, "captured_at": 1, "amount_paise": 1},
        )
    )

    # Most recent bank balance row.
    # Mongoose pluralises BankBalance → "bankbalances" collection.
    balance_row = db.bankbalances.find_one(
        {"merchant_id": canonical_mid},
        sort=[("date", -1)],
    )
    current_balance_paise: int = int(balance_row["closing_balance_paise"]) if balance_row else 0

    # Loan — SYNTHETIC: models Razorpay Capital shape, no public sandbox exists
    loan_row = db.loans.find_one({"merchant_id": canonical_mid})
    loan: dict = {}
    if loan_row:
        loan = {
            "emi_amount_paise": loan_row.get("emi_amount_paise", 0),
            "emi_due_date": str(loan_row["emi_due_date"])[:10] if loan_row.get("emi_due_date") else None,
        }

    # Payroll — SYNTHETIC: models Razorpay Payroll shape, no public sandbox exists
    # Mongoose pluralises Payroll → "payrolls" collection.
    payroll_row = db.payrolls.find_one(
        {"merchant_id": canonical_mid},
        sort=[("pay_date", 1)],  # next upcoming payroll
    )
    payroll: dict = {}
    if payroll_row:
        payroll = {
            "total_salary_paise": payroll_row.get("total_salary_paise", 0),
            "pay_date": str(payroll_row["pay_date"])[:10] if payroll_row.get("pay_date") else None,
        }

    return {
        "merchant_id": canonical_mid,
        "sales_history": raw_sales,
        "current_balance_paise": current_balance_paise,
        "loan": loan,
        "payroll": payroll,
    }


def _persist_forecast(merchant_id: str, result: dict) -> str:
    """
    Write the forecast result to the `forecasts` collection and return the
    inserted document's string id.
    """
    db = get_db()
    doc = {
        "merchant_id": merchant_id,
        "generated_at": datetime.now(timezone.utc),
        "daily_projected_balance": result["daily_projected_balance"],
        "shortfall_detected": result["shortfall_detected"],
        "shortfall_date": result["shortfall_date"],
        "shortfall_amount_paise": result["shortfall_amount_paise"],
        "expected_inflow_by_weekday": result["expected_inflow_by_weekday"],
    }
    inserted = db.forecasts.insert_one(doc)
    return str(inserted.inserted_id)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/forecast/all")
def forecast_all(horizon_days: int = 14) -> list[dict]:
    """
    Run forecasts for every merchant and return a summary list.

    Each item: { merchant_id, shortfall_detected, shortfall_date,
                 shortfall_amount_paise, forecast_id }

    This is the endpoint the dashboard's merchant list calls for the overview.
    Errors for individual merchants are caught and surfaced as an ``error``
    field rather than aborting the whole batch.

    NOTE: registered before /forecast/{merchant_id} so the literal path
    segment "all" is not swallowed by the parameterised route.
    """
    db = get_db()
    merchants = list(db.merchants.find({}, {"_id": 0, "merchant_id": 1}))

    summaries: list[dict] = []
    for m in merchants:
        mid = m["merchant_id"]
        try:
            inputs = _load_merchant_inputs(mid)
            result = forecast_merchant(
                sales_history=inputs["sales_history"],
                current_balance_paise=inputs["current_balance_paise"],
                loan=inputs["loan"],
                payroll=inputs["payroll"],
                horizon_days=horizon_days,
            )
            forecast_id = _persist_forecast(mid, result)
            summaries.append(
                {
                    "merchant_id": mid,
                    "shortfall_detected": result["shortfall_detected"],
                    "shortfall_date": result["shortfall_date"],
                    "shortfall_amount_paise": result["shortfall_amount_paise"],
                    "forecast_id": forecast_id,
                }
            )
        except Exception as exc:
            summaries.append(
                {
                    "merchant_id": mid,
                    "shortfall_detected": False,
                    "shortfall_date": None,
                    "shortfall_amount_paise": 0,
                    "forecast_id": None,
                    "error": str(exc),
                }
            )

    return summaries


@app.get("/forecast/{merchant_id}")
def forecast_one(merchant_id: str, horizon_days: int = 14) -> dict:
    """
    Run and persist a 14-day cash forecast for a single merchant.

    Returns the full forecast result plus the persisted document id.
    """
    inputs = _load_merchant_inputs(merchant_id)

    result = forecast_merchant(
        sales_history=inputs["sales_history"],
        current_balance_paise=inputs["current_balance_paise"],
        loan=inputs["loan"],
        payroll=inputs["payroll"],
        horizon_days=horizon_days,
    )

    forecast_id = _persist_forecast(merchant_id, result)

    return {
        "merchant_id": merchant_id,
        "forecast_id": forecast_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        **result,
    }


@app.post("/recommend/{merchant_id}")
def recommend(merchant_id: str) -> dict:
    """
    Generate recommendations for a merchant's latest forecast and persist them.

    Governance rule (non-negotiable):
      - This endpoint only ever writes status="pending" to the recommendations
        collection.
      - It NEVER calls a Razorpay payout endpoint.
      - It NEVER imports or calls anything from server/services/razorpayx.js —
        that layer is Express-only and is gated behind human approval.

    Steps:
      1. Verify the merchant exists.
      2. Load the most recent forecast for this merchant.
      3. Call generate_recommendations() (pure function — no I/O inside).
      4. Write the result to the recommendations collection with status="pending".
      5. Return the created recommendation document.

    Returns 404 if the merchant or any prior forecast cannot be found.
    Returns 400 if the latest forecast has shortfall_detected=False (nothing to
    recommend).
    """
    db = get_db()

    # 1. Verify merchant exists
    merchant = db.merchants.find_one({"merchant_id": merchant_id})
    if merchant is None:
        from bson import ObjectId
        try:
            merchant = db.merchants.find_one({"_id": ObjectId(merchant_id)})
        except Exception:
            pass
    if merchant is None:
        raise HTTPException(status_code=404, detail=f"Merchant '{merchant_id}' not found")

    # 2. Load the most recent forecast
    forecast_doc = db.forecasts.find_one(
        {"merchant_id": merchant_id},
        sort=[("generated_at", -1)],
    )
    if forecast_doc is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No forecast found for merchant '{merchant_id}'. "
                "Run GET /forecast/{merchant_id} first."
            ),
        )

    if not forecast_doc.get("shortfall_detected", False):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Latest forecast for merchant '{merchant_id}' shows no shortfall "
                "(shortfall_detected=False). No recommendations generated."
            ),
        )

    # 3. Generate options — pure function, no I/O
    # Pass a plain dict; strip the Mongo _id so it serialises cleanly.
    forecast_plain = {k: v for k, v in forecast_doc.items() if k != "_id"}
    forecast_plain["forecast_id"] = str(forecast_doc["_id"])

    merchant_plain = {k: v for k, v in merchant.items() if k != "_id"}
    merchant_plain["merchant_id"] = merchant_id

    options = generate_recommendations(
        forecast=forecast_plain,
        merchant=merchant_plain,
    )

    # 4. Write to recommendations collection — always status="pending"
    # (The Express server transitions to approved/rejected after human approval.)
    doc: dict = {
        "merchant_id": merchant_id,
        "forecast_id": forecast_doc["_id"],  # ObjectId reference
        "options": options,
        "status": "pending",          # AI service ONLY ever writes "pending"
        "chosen_option": None,
        "created_at": datetime.now(timezone.utc),
    }
    inserted = db.recommendations.insert_one(doc)

    # 5. Return the created document (with string ids for JSON serialisation)
    result = {**doc}
    result["_id"] = str(inserted.inserted_id)
    result["forecast_id"] = str(doc["forecast_id"])
    result["created_at"] = doc["created_at"].isoformat()

    return result


@app.get("/accuracy-report")
def accuracy_report() -> dict:
    """
    Run a fresh 14-day forecast for every merchant, compare the results against
    the planted ground-truth shortfalls in scripts/output/ground_truth.json, and
    persist + return a complete accuracy report.

    This route always re-runs the forecasting engine — it never reads cached
    forecasts — so the report always reflects the current engine logic.

    Steps
    -----
    1. Load all merchants from the DB.
    2. For each merchant, run _load_merchant_inputs + forecast_merchant fresh.
       Persist each forecast with _persist_forecast (normal behaviour).
    3. Load ground_truth.json from the filesystem.
    4. Call build_accuracy_report() — pure function, no I/O.
    5. Persist the result to the accuracy_reports collection.
    6. Return the persisted document (with string IDs for JSON serialisation).

    Returns 500 if ground_truth.json cannot be read.
    """
    import json
    import uuid
    from pathlib import Path

    db = get_db()

    # ------------------------------------------------------------------
    # 1 + 2. Re-run forecasts for every merchant (fresh, not from cache)
    # ------------------------------------------------------------------
    merchants = list(db.merchants.find({}, {"_id": 0, "merchant_id": 1}))
    fresh_forecasts: list[dict] = []

    for m in merchants:
        mid = m["merchant_id"]
        try:
            inputs = _load_merchant_inputs(mid)
            result = forecast_merchant(
                sales_history=inputs["sales_history"],
                current_balance_paise=inputs["current_balance_paise"],
                loan=inputs["loan"],
                payroll=inputs["payroll"],
                horizon_days=14,
            )
            # Persist to forecasts collection as normal
            _persist_forecast(mid, result)
            fresh_forecasts.append(
                {
                    "merchant_id": mid,
                    "shortfall_detected": result["shortfall_detected"],
                    "shortfall_date": result["shortfall_date"],
                    "shortfall_amount_paise": result["shortfall_amount_paise"],
                }
            )
        except Exception as exc:
            # Surface errors per-merchant rather than aborting the whole run.
            # Treat as no-shortfall so precision/recall are not artificially skewed.
            fresh_forecasts.append(
                {
                    "merchant_id": mid,
                    "shortfall_detected": False,
                    "shortfall_date": None,
                    "shortfall_amount_paise": 0,
                    "_error": str(exc),
                }
            )

    # ------------------------------------------------------------------
    # 3. Load ground truth from disk
    # ------------------------------------------------------------------
    # Resolve relative to the repo root regardless of where uvicorn is launched.
    repo_root = Path(__file__).resolve().parent.parent
    gt_path = repo_root / "scripts" / "output" / "ground_truth.json"

    if not gt_path.exists():
        raise HTTPException(
            status_code=500,
            detail=f"ground_truth.json not found at expected path: {gt_path}",
        )

    try:
        with gt_path.open("r", encoding="utf-8") as fh:
            ground_truth: list[dict] = json.load(fh)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to read ground_truth.json: {exc}",
        )

    # ------------------------------------------------------------------
    # 4. Build the report — pure function
    # ------------------------------------------------------------------
    report = build_accuracy_report(fresh_forecasts, ground_truth)

    # ------------------------------------------------------------------
    # 5. Persist to accuracy_reports collection
    # ------------------------------------------------------------------
    run_id: str = str(uuid.uuid4())
    doc = {
        "run_id": run_id,
        "total_merchants": report["total_merchants"],
        "planted_shortfalls": report["planted_shortfalls"],
        "correctly_flagged": report["correctly_flagged"],
        "missed": report["missed"],
        "false_alarms": report["false_alarms"],
        "precision": report["precision"],
        "recall": report["recall"],
        "exceptions": report["exceptions"],
        "generated_at": datetime.now(timezone.utc),
    }
    inserted = db.accuracy_reports.insert_one(doc)

    # ------------------------------------------------------------------
    # 6. Return the persisted document
    # ------------------------------------------------------------------
    result_doc = {**doc}
    result_doc["_id"] = str(inserted.inserted_id)
    result_doc["generated_at"] = doc["generated_at"].isoformat()

    return result_doc


