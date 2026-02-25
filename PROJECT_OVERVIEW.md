# Vercel Webhook Project Overview

## Project Summary

The Vercel Webhook Integration is a serverless system that connects Retell AI voice agents with Google Sheets for automated call data collection, technician assignment, and company-specific workflows. It exposes dedicated endpoints for **Pacific Western**, **Braconier**, **Adaptive Climate**, and **EliteFire**, plus a generic webhook router and a generic Sheets endpoint.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Retell AI     │    │  Vercel Webhook  │    │  External APIs  │    │  Google Sheets  │
│   Voice Agent   │───▶│   (Serverless)   │───▶│  (Tech Data)    │───▶│   (Data Store)  │
│                 │    │                  │    │                 │    │                 │
│ • Call Analysis │    │ • Variable       │    │ • EliteFire     │    │ • Call Records  │
│ • Dynamic Vars  │    │   Extraction     │    │   Assignments   │    │ • Tech Info     │
│ • Webhooks      │    │ • API Integration│    │ • Plumbing/HVAC │    │ • Analytics     │
│ • Event Routing │    │ • Data Processing│    │ • HVAC          │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘    └─────────────────┘
```

## Core Components

### 1. Main webhook router (`/api/webhook`)

- **File**: `api/webhook.py`
- **Routes**: `GET/POST /`, `GET/POST /api/webhook`; path rewrites: `/elitefire`, `/braconier`, `/adaptive`, `/pacific` → `/api/webhook?client=...`
- **Purpose**: Single entry point; uses `?client=elitefire|braconier|adaptive|pacific` to send to the correct Google Sheet (via `*_EXEC_URL` env vars). Extracts variables, fetches tech data from HVAC/Plumbing APIs, and posts to Sheets.

### 2. EliteFire (`/api/elitefire`)

- **File**: `api/elitefire.py`
- **Purpose**: EliteFire-specific flow. Extracts `fromNumber`, `customerName`, `serviceAddress`, `callSummary`, `email`, `recording_url`. Fetches tech email from EliteFire assignments API (`https://elitefire-dwa7rawf3-mahees-projects-2df6704a.vercel.app/api/assignments`). Sends to Google Sheets via `ELITEFIRE_EXEC_URL`.

### 3. Braconier (`/api/braconier`)

- **File**: `api/braconier.py`
- **Purpose**: Plumbing/HVAC call handling. Extracts caller and job variables plus `isitEmergency`, `emergencyType`. Uses HVAC API and Plumbing API for tech data. Deduplication state in `/tmp/processed_calls_sheets3.json`. Sends to Sheets via `BRACONIER_EXEC_URL`.

### 4. Adaptive Climate (`/api/adaptiveclimate`)

- **File**: `api/adaptiveclimate.py`
- **Purpose**: Adaptive Climate calls. Same variable set as Braconier, with company-specific extraction and tech APIs. Deduplication in `/tmp/processed_calls_sheets4.json`. Sends to Sheets via `ADAPTIVE_EXEC_URL`.

### 5. Pacific Western (`/api/pacificwestern`)

- **File**: `api/pacificwestern.py`
- **Purpose**: Pacific Western calls. Extracts caller/job variables; fetches tech from HVAC/Plumbing APIs; can send scheduling emails via SendGrid when callers decline after-hours rate. Deduplication in `/tmp/processed_calls_sheets2.json`. Sends to Sheets via `PACIFIC_EXEC_URL`. Requires `SENDGRID_API_KEY` for email.

### 6. Generic Sheets (`/api/sheets`)

- **File**: `api/sheets.py`
- **Purpose**: Generic integration using `GOOGLE_SHEETS_URL`. Variable set: `firstName`, `lastName`, `email`, `description`, `facilityName`, `doctorName`, etc. (trip/facility style).

### 7. Health and overview

- **`/api/health`** (`api/health.py`): Simple health check.
- **`/api/overview`** (`api/overview.py`): Service description, required env vars, and company workflow list.

## Data flow (per company)

### EliteFire

1. Retell sends `call_analyzed` to `/api/elitefire`.
2. Extract variables (including `recording_url`).
3. Get tech email from EliteFire assignments API.
4. POST payload to Google Sheets via `ELITEFIRE_EXEC_URL`.

### Braconier / Adaptive Climate

1. `call_analyzed` → `/api/braconier` or `/api/adaptiveclimate`.
2. Extract variables (fromNumber, customerName, serviceAddress, callSummary, email, isitEmergency, emergencyType).
3. Optional deduplication (hash of call_id + variables + time).
4. Fetch tech from Plumbing/HVAC APIs (by emergency type).
5. Send to Sheets via `BRACONIER_EXEC_URL` or `ADAPTIVE_EXEC_URL`.

### Pacific Western

1. `call_analyzed` → `/api/pacificwestern`.
2. Extract variables; optional deduplication.
3. Fetch tech from HVAC/Plumbing APIs.
4. Send to Sheets via `PACIFIC_EXEC_URL`.
5. When applicable, send scheduling email via SendGrid to scheduling@pwfire.ca.

## Variable extraction (priority order)

1. **collected_dynamic_variables** – primary Retell variables.
2. **call_analysis.custom_analysis_data** – custom analysis.
3. **transcript_with_tool_calls** – e.g. `extract_variables` tool result.
4. **tool_call_result** – any tool result containing variable keys.
5. **Direct fields** on `call_data` (fallback).

## External APIs

- **EliteFire**: `https://elitefire-dwa7rawf3-mahees-projects-2df6704a.vercel.app/api/assignments` (tech email for EliteFire).
- **HVAC**: `https://hvacapi.vercel.app/api/assignments`
- **Plumbing**: `https://plumbing-api.vercel.app/api/assignments`

Expected response shape: `{ "assignments": [ { "techs": [ { "name", "email", "phone" } ] } ] }`.

Fallbacks: `FALLBACK_TECH_EMAIL`, `FALLBACK_TECH_PHONE` (optional env vars).

## Environment variables

| Variable | Used by | Required |
|----------|---------|----------|
| `ELITEFIRE_EXEC_URL` | EliteFire | Yes (for EliteFire) |
| `BRACONIER_EXEC_URL` | Braconier / webhook | Yes (for Braconier) |
| `ADAPTIVE_EXEC_URL` | Adaptive / webhook | Yes (for Adaptive) |
| `PACIFIC_EXEC_URL` | Pacific / webhook | Yes (for Pacific) |
| `GOOGLE_SHEETS_URL` | Generic sheets | Yes (for /api/sheets) |
| `SENDGRID_API_KEY` | Pacific Western email | Yes (for Pacific email) |
| `FALLBACK_TECH_EMAIL` | Various | Optional |
| `FALLBACK_TECH_PHONE` | Various | Optional |

## Deduplication (where used)

- **Braconier**: `/tmp/processed_calls_sheets3.json`
- **Adaptive Climate**: `/tmp/processed_calls_sheets4.json`
- **Pacific Western**: `/tmp/processed_calls_sheets2.json`

Logic: MD5 of call_id + variables + timestamp; cleanup of old entries (e.g. 24h); cap on stored entries.

## Deployment

- **Platform**: Vercel serverless (Python).
- **Config**: `vercel.json` defines rewrites; each `api/*.py` is a serverless function (e.g. `api/elitefire.py` → `/api/elitefire`).
- **Dependencies**: Python standard library only (`requirements.txt` / `pyproject.toml`).

## Error handling and responses

- **200**: Success, or ignored (e.g. non–`call_analyzed` event).
- **400**: Invalid JSON.
- **500**: Processing error.

Logging uses prefixes such as `[SHEETS5]`, `[WEBHOOK]`, `[EMAIL]` for easier filtering in Vercel logs.
