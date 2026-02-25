# Retell AI Google Sheets Integration

A serverless webhook system that integrates Retell AI voice agents with Google Sheets for automated call data collection and analysis. It supports multiple company-specific endpoints: Pacific Western, Braconier, Adaptive Climate, and EliteFire.

## Project structure

```
vercel-webhook-integration/
├── api/
│   ├── webhook.py           # Main router: POST /api/webhook?client=braconier|adaptive|elitefire|pacific
│   ├── elitefire.py         # EliteFire → Sheets + EliteFire assignments API
│   ├── braconier.py         # Braconier (plumbing/HVAC) → Sheets
│   ├── adaptiveclimate.py   # Adaptive Climate → Sheets
│   ├── pacificwestern.py    # Pacific Western → Sheets + SendGrid email
│   ├── sheets.py            # Generic Sheets (GOOGLE_SHEETS_URL)
│   ├── health.py            # Health check
│   └── overview.py          # Service overview + config
├── requirements.txt         # Python (stdlib only)
├── vercel.json              # Rewrites: /, /elitefire, /braconier, /adaptive, /pacific → webhook
├── deploy.sh                # Deploy script
├── PROJECT_OVERVIEW.md      # Architecture and flows
└── README.md                # This file
```

## Available endpoints

| Endpoint | Purpose |
|----------|---------|
| **GET/POST** `/` or `/api/webhook` | Main handler; use `?client=braconier`, `adaptive`, `elitefire`, or `pacific` for POST |
| **GET/POST** `/api/elitefire` | EliteFire: variables + recording_url, tech email from EliteFire assignments API → Sheets |
| **GET/POST** `/api/braconier` | Braconier: plumbing/HVAC, tech from HVAC/Plumbing APIs → Sheets |
| **GET/POST** `/api/adaptiveclimate` | Adaptive Climate: tech assignment → Sheets |
| **GET/POST** `/api/pacificwestern` | Pacific Western: tech assignment, SendGrid email → Sheets |
| **GET/POST** `/api/sheets` | Generic: sends to `GOOGLE_SHEETS_URL` (trip/facility variables) |
| **GET** `/api/health` | Health check |
| **GET** `/api/overview` | Service overview and required env vars |

### URL rewrites (vercel.json)

- `/` → `/api/webhook`
- `/elitefire` → `/api/webhook?client=elitefire`
- `/braconier` → `/api/webhook?client=braconier`
- `/adaptive` → `/api/webhook?client=adaptive`
- `/pacific` → `/api/webhook?client=pacific`

## Environment variables

Set in Vercel (or `.env` locally):

```bash
# Google Apps Script Web App URLs (one per company)
PACIFIC_EXEC_URL=https://script.google.com/macros/s/.../exec
BRACONIER_EXEC_URL=https://script.google.com/macros/s/.../exec
ADAPTIVE_EXEC_URL=https://script.google.com/macros/s/.../exec
ELITEFIRE_EXEC_URL=https://script.google.com/macros/s/.../exec

# Generic Sheets (for /api/sheets)
GOOGLE_SHEETS_URL=https://script.google.com/macros/s/.../exec

# Pacific Western email (SendGrid)
SENDGRID_API_KEY=SG....

# Optional fallbacks
FALLBACK_TECH_EMAIL=fallback@company.com
FALLBACK_TECH_PHONE=+1234567890
```

## Configure Retell AI

Use one webhook URL per company:

- **EliteFire:** `https://your-deployment.vercel.app/api/elitefire`
- **Braconier:** `https://your-deployment.vercel.app/api/braconier`
- **Adaptive Climate:** `https://your-deployment.vercel.app/api/adaptiveclimate`
- **Pacific Western:** `https://your-deployment.vercel.app/api/pacificwestern`

Or use the main router with a query param:

- `https://your-deployment.vercel.app/api/webhook?client=elitefire` (same for braconier, adaptive, pacific)

## Features

- **Multi-source variable extraction** from `collected_dynamic_variables`, `custom_analysis_data`, transcript tool calls, and direct fields.
- **Company-specific logic**: EliteFire uses EliteFire assignments API; Braconier/Adaptive use HVAC/Plumbing APIs; Pacific Western can send scheduling emails via SendGrid.
- **Deduplication** (where used): MD5-based to avoid duplicate sheet rows.
- **Health checks**: GET any of the API routes for status.
- **CORS** and **OPTIONS** supported.

## Testing

```bash
# Health
curl https://your-deployment.vercel.app/
curl https://your-deployment.vercel.app/api/elitefire
curl https://your-deployment.vercel.app/api/health

# Post a call_analyzed event (example: EliteFire)
curl -X POST https://your-deployment.vercel.app/api/elitefire \
  -H "Content-Type: application/json" \
  -d '{"event":"call_analyzed","call":{"call_id":"test_123","call_analysis":{"call_summary":"Test"}}}'
```

## Deploy

```bash
./deploy.sh
# or
vercel --prod
```

## Related

Part of the Retell AI integration suite for automated call processing and Google Sheets.
