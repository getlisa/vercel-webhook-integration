# Vercel Webhook API Reference

## Overview

The Vercel Webhook system provides specialized endpoints for integrating Retell AI with Google Sheets, supporting multiple business verticals including fire safety services and plumbing/HVAC operations.

## Base URL

```
https://your-deployment.vercel.app
```

## Authentication

No authentication required. The webhooks are designed to receive public webhook calls from Retell AI.

## Endpoints

### 1. Fire Safety Integration

#### Health Check
```http
GET /api/sheets2
```

**Response:**
```json
{
  "message": "Google Sheets Integration API v2",
  "status": "healthy",
  "variables": ["fromNumber", "customerName", "serviceAddress", "callSummary", "email"],
  "endpoints": {
    "POST /": "Process call analysis data and send to Google Sheets v2"
  }
}
```

#### Process Fire Safety Call
```http
POST /api/sheets2
Content-Type: application/json
```

**Request Body:** Retell AI `call_analyzed` event payload

**Required Variables (extracted from payload):**
- `fromNumber` - Caller's phone number
- `customerName` - Customer name
- `serviceAddress` - Service location address
- `emergencyType` - Type of emergency ("Fire Alarm" or "Sprinkler")

**Optional Variables:**
- `callSummary` - Call summary
- `email` - Contact email
- `isitEmergency` - Emergency flag

**Response Codes:**
- `200` - Success, skipped (duplicate), or ignored
- `400` - Invalid JSON payload
- `500` - Internal server error

**Success Response:**
```json
{
  "status": "success",
  "message": "Data sent to Google Sheets v2",
  "call_id": "call_xxxxx",
  "extracted_variables": {
    "fromNumber": "+1234567890",
    "customerName": "John Doe",
    "serviceAddress": "123 Main St, City, State",
    "callSummary": "Fire alarm system needs inspection",
    "email": "customer@email.com",
    "isitEmergency": "Yes",
    "emergencyType": "Fire Alarm"
  },
  "transcript": "Full call transcript...",
  "tech_data": {
    "name": "John Smith",
    "email": "tech@firealarm.com",
    "phone": "+1987654321"
  },
  "call_metadata": {
    "agent_name": "Fire Safety Agent",
    "duration_ms": 45000,
    "user_sentiment": "concerned",
    "call_successful": true
  }
}
```

### 2. Plumbing/HVAC Integration

#### Health Check
```http
GET /api/sheets3
```

**Response:**
```json
{
  "message": "Google Sheets Integration API v3 (Plumbing/HVAC)",
  "status": "healthy",
  "variables": ["fromNumber", "customerName", "serviceAddress", "callSummary", "email"],
  "apis": ["Plumbing API", "HVAC API"],
  "endpoints": {
    "POST /": "Process call analysis data and send to Google Sheets v3"
  }
}
```

#### Process Plumbing/HVAC Call
```http
POST /api/sheets3
Content-Type: application/json
```

**Request Body:** Retell AI `call_analyzed` event payload

**Required Variables (extracted from payload):**
- `fromNumber` - Caller's phone number
- `customerName` - Customer name
- `serviceAddress` - Service location address
- `emergencyType` - Type of emergency ("Plumbing" or "HVAC")

**Optional Variables:**
- `callSummary` - Call summary
- `email` - Contact email
- `isitEmergency` - Emergency flag

**Response Codes:**
- `200` - Success, skipped (duplicate), or ignored
- `400` - Invalid JSON payload
- `500` - Internal server error

**Success Response:**
```json
{
  "status": "success",
  "message": "Data sent to Google Sheets v3 (Plumbing/HVAC)",
  "call_id": "call_xxxxx",
  "extracted_variables": {
    "fromNumber": "+1234567890",
    "customerName": "Jane Smith",
    "serviceAddress": "456 Oak Ave, City, State",
    "callSummary": "Burst pipe in basement needs immediate repair",
    "email": "customer@email.com",
    "isitEmergency": "Yes",
    "emergencyType": "Plumbing"
  },
  "transcript": "Full call transcript...",
  "tech_data": {
    "name": "Mike Johnson",
    "email": "tech@plumbing.com",
    "phone": "+1555123456"
  },
  "call_metadata": {
    "agent_name": "Plumbing Agent",
    "duration_ms": 60000,
    "user_sentiment": "urgent",
    "call_successful": true
  }
}
```

## Variable Extraction

### Extraction Sources (Priority Order)

The system extracts variables from multiple locations in the Retell AI payload:

1. **collected_dynamic_variables** - Primary location for Retell AI variables
2. **custom_analysis_data** - Custom analysis results
3. **transcript_with_tool_calls** - Tool call results (extract_variables function)
4. **tool_call_result** - Any tool call results containing variables
5. **Direct fields** - Direct fields in call_data (fallback)

### Variable Processing

Each endpoint uses specialized extraction functions:
- `extract_variables_v2()` for fire safety calls
- `extract_variables_v3()` for plumbing/HVAC calls

Both functions follow the same pattern but are optimized for their respective domains.

## External API Integration

### Fire Safety APIs

**Priority Logic:**
- If `emergencyType` is "Sprinkler": Try Sprinkler API first, then Fire Alarm API
- If `emergencyType` is "Fire Alarm" or empty: Try Fire Alarm API first, then Sprinkler API

**API Endpoints:**
- Fire Alarm: `https://fire-alarm-men6qqx0l-mahees-projects-2df6704a.vercel.app/api/assignments`
- Sprinkler: `https://sprinkler-p52oxcmyy-mahees-projects-2df6704a.vercel.app/api/assignments`

### Plumbing/HVAC APIs

**Priority Logic:**
- If `emergencyType` is "Plumbing": Try Plumbing API first, then HVAC API
- If `emergencyType` is "HVAC" or empty: Try HVAC API first, then Plumbing API

**API Endpoints:**
- Plumbing: `https://plumbing-api.vercel.app/api/assignments`
- HVAC: `https://hvacapi.vercel.app/api/assignments`

### API Response Processing

**Expected API Response Format:**
```json
{
  "assignments": [
    {
      "techs": [
        {
          "name": "John Smith",
          "email": "tech@company.com",
          "phone": "+1234567890"
        }
      ]
    }
  ]
}
```

**Fallback Logic:**
1. Try primary API based on emergency type
2. If no data, try secondary API
3. If still no data, use environment variables:
   - `FALLBACK_TECH_EMAIL`
   - `FALLBACK_TECH_PHONE`

## Error Handling

### Error Response Format

**Client Error (400):**
```json
{
  "error": "Invalid JSON payload"
}
```

**Server Error (500):**
```json
{
  "error": "Internal Server Error"
}
```

### Partial Success Handling

The system can return partial success when some operations succeed:

```json
{
  "status": "partial_success",
  "message": "Data may have been sent to Google Sheets but response failed",
  "call_id": "call_xxxxx",
  "extracted_variables": {...}
}
```

### Duplicate Call Handling

**Skipped Response:**
```json
{
  "status": "skipped",
  "message": "Duplicate call ignored",
  "call_id": "call_xxxxx"
}
```

**Ignored Event Response:**
```json
{
  "status": "ignored",
  "message": "Event type 'call_started' not processed",
  "call_id": "call_xxxxx"
}
```

## Deduplication System

### Hash Generation

The system creates MD5 hashes from:
- `call_id`
- `custom_analysis_data` (stringified)
- `collected_dynamic_variables` (stringified)
- `timestamp_minute` (rounded to minute)

### Storage Management

- **File Location**: `/tmp/processed_calls_sheets2.json` or `/tmp/processed_calls_sheets3.json`
- **Cleanup**: Removes entries older than 24 hours
- **Size Limit**: Keeps only 1000 most recent entries
- **Automatic**: Cleanup runs on each request

## Google Sheets Integration

### Data Structure Sent to Sheets

```json
{
  "timestamp": "2025-01-05T14:30:45.123Z",
  "call_id": "call_xxxxx",
  "agent_name": "Agent Name",
  "call_duration": 45000,
  "user_sentiment": "positive",
  "call_successful": true,
  "call_summary": "Call summary text",
  "transcript": "Full call transcript",
  "fromNumber": "+1234567890",
  "customerName": "John Doe",
  "serviceAddress": "123 Main St",
  "callSummary": "Extracted call summary",
  "email": "tech@company.com",
  "phone": "+1987654321",
  "isitEmergency": "Yes",
  "emergencyType": "Fire Alarm"
}
```

### Google Apps Script Integration

Each endpoint requires a corresponding Google Apps Script Web App:
- Fire Safety: Uses `google-apps-script-v3.js`
- Plumbing/HVAC: Uses `google-apps-script-v4.js`

**Environment Variables Required:**
- `GOOGLE_SHEETS_URL_2` - Fire safety Google Apps Script Web App URL
- `GOOGLE_SHEETS_URL_3` - Plumbing/HVAC Google Apps Script Web App URL

## Rate Limits

- **Vercel Function Timeout**: 10 seconds (Hobby plan) / 60 seconds (Pro plan)
- **Google Apps Script Timeout**: 6 minutes maximum execution time
- **External API Timeout**: 10 seconds per API call
- **No explicit rate limits**: Designed for typical call volumes

## Monitoring

### Logging Format

All logs use prefixed format for easy filtering:
- `[SHEETS2]` - Fire safety operations
- `[SHEETS3]` - Plumbing/HVAC operations
- `[SHEETS2 ERROR]` / `[SHEETS3 ERROR]` - Error conditions
- `[API]` - External API operations

### Health Monitoring

Use GET endpoints for monitoring:
```bash
# Check fire safety endpoint
curl https://your-deployment.vercel.app/api/sheets2

# Check plumbing/HVAC endpoint
curl https://your-deployment.vercel.app/api/sheets3
```

### Log Analysis

```bash
# View all logs
vercel logs https://your-deployment.vercel.app

# Filter by endpoint
vercel logs https://your-deployment.vercel.app | grep SHEETS2
vercel logs https://your-deployment.vercel.app | grep SHEETS3

# Filter errors only
vercel logs https://your-deployment.vercel.app | grep ERROR
```

## Testing

### Sample Payloads

**Fire Safety Test:**
```json
{
  "event": "call_analyzed",
  "call": {
    "call_id": "test_fire_123",
    "agent_name": "Fire Safety Agent",
    "duration_ms": 45000,
    "start_timestamp": 1704462000000,
    "collected_dynamic_variables": {
      "fromNumber": "+1234567890",
      "customerName": "John Doe",
      "serviceAddress": "123 Fire Station Rd",
      "emergencyType": "Fire Alarm",
      "isitEmergency": "Yes"
    },
    "call_analysis": {
      "call_summary": "Fire alarm system inspection needed",
      "user_sentiment": "concerned",
      "call_successful": true
    },
    "transcript": "Customer called about fire alarm system..."
  }
}
```

**Plumbing/HVAC Test:**
```json
{
  "event": "call_analyzed",
  "call": {
    "call_id": "test_plumbing_123",
    "agent_name": "Plumbing Agent",
    "duration_ms": 60000,
    "start_timestamp": 1704462000000,
    "collected_dynamic_variables": {
      "fromNumber": "+1987654321",
      "customerName": "Jane Smith",
      "serviceAddress": "456 Oak Avenue",
      "emergencyType": "Plumbing",
      "isitEmergency": "Yes"
    },
    "call_analysis": {
      "call_summary": "Burst pipe emergency repair needed",
      "user_sentiment": "urgent",
      "call_successful": true
    },
    "transcript": "Customer reported burst pipe in basement..."
  }
}
```

### Test Commands

```bash
# Test fire safety endpoint
curl -X POST https://your-deployment.vercel.app/api/sheets2 \
  -H "Content-Type: application/json" \
  -d @fire_safety_test.json

# Test plumbing/HVAC endpoint
curl -X POST https://your-deployment.vercel.app/api/sheets3 \
  -H "Content-Type: application/json" \
  -d @plumbing_hvac_test.json
```

## Outbound Call Automation

### Overview

The system includes automated outbound calling functionality implemented through Google Apps Script. This feature automatically makes emergency calls to technicians when urgent situations are detected in the Google Sheets data.

### Automation Trigger

The automation runs every 1 minute via Google Apps Script time-based triggers and processes rows that meet these conditions:
- `make_call` = true (or null/empty)
- `is_emergency` = true (or "yes", "YES", 1)

### Call Sequence Logic

#### Fire Safety (2 attempts + fallback)
1. **First Call**: Tech phone → response_call_id_1, counter=1
2. **Second Call**: After 5min delay → response_call_id_2, counter=2  
3. **Fallback Call**: ServiceTrade API number → automation disabled

#### Plumbing/HVAC (3 attempts + fallback)
1. **First Call**: Tech phone → response_call_id_1, counter=1
2. **Second Call**: After 5min delay → response_call_id_2, counter=2
3. **Third Call**: After 5min delay → response_call_id_3, counter=3
4. **Fallback Call**: Plumbing/HVAC API number → automation disabled

### Outbound Call API Integration

#### Retell AI Outbound Call Creation
```http
POST https://api.retellai.com/v2/create-phone-call
Authorization: Bearer {RETELL_API_KEY}
Content-Type: application/json
```

**Request Body:**
```json
{
  "from_number": "+17789465528",
  "to_number": "+1234567890",
  "override_agent_id": "agent_88461729280fe5f698d7141451",
  "retell_llm_dynamic_variables": {
    "customer_name": "John Doe",
    "customer_address": "123 Main St",
    "transcript": "Original call transcript",
    "call_summary": "Emergency situation summary",
    "transfer_number": "+1987654321",
    "emergency_type": "Fire Alarm",
    "is_emergency": "Yes",
    "call_purpose": "emergency_notification"
  }
}
```

**Response:**
```json
{
  "call_id": "call_abc123",
  "status": "created"
}
```

#### Call Status Monitoring
```http
GET https://api.retellai.com/v2/get-call/{call_id}
Authorization: Bearer {RETELL_API_KEY}
```

**Response:**
```json
{
  "call_id": "call_abc123",
  "call_status": "ended",
  "end_timestamp": 1704462300000,
  "transcript_with_tool_calls": [
    {
      "role": "tool_call_invocation",
      "name": "transfer_call",
      "tool_call_id": "tool_123"
    }
  ]
}
```

### Transfer Detection

The system monitors for `transfer_call` tool invocation in the call transcript:
- **Tool Found**: Automation stops immediately (make_call = false)
- **No Tool**: Continues to next attempt after delay
- **Status Check**: Monitors call_status and end_timestamp

### Phone Number Resolution

#### Primary Numbers
- Uses `tech_phone` from Google Sheets data
- Formats to +1XXXXXXXXXX standard

#### Fallback Numbers
- **Fire Safety**: ServiceTrade API user lookup
- **Plumbing/HVAC**: Plumbing/HVAC APIs technician lookup
- **Environment**: FALLBACK_TECH_PHONE variable

#### ServiceTrade API Integration
```http
POST https://app.servicetrade.com/api/auth
Content-Type: application/json

{
  "username": "username",
  "password": "password"
}
```

```http
GET https://api.servicetrade.com/api/user?name={user_name}
Cookie: PHPSESSID={auth_token}
```

### Automation Control Columns

#### Google Sheets Columns
| Column | Purpose | Values | Auto-managed |
|--------|---------|--------|--------------|
| make_call | Enable/disable automation | true/false | Yes |
| response_call_id_1 | First call ID | call_xxxxx | Yes |
| response_call_id_2 | Second call ID | call_xxxxx | Yes |
| response_call_id_3 | Third call ID (plumbing/HVAC) | call_xxxxx | Yes |
| call_decline_counter | Attempt counter | 0,1,2,3 | Yes |

#### Automation States
- **Counter 0**: Ready for first call
- **Counter 1**: First call made, waiting for status check
- **Counter 2**: Second call made, waiting for status check  
- **Counter 3**: Third call made (plumbing/HVAC), waiting for status check
- **make_call false**: Automation disabled

### Configuration

#### Google Apps Script Setup
```javascript
const CONFIG = {
  RETELL_API_KEY: 'key_xxxxx',
  FROM_NUMBER: '+17789465528',
  AGENT_ID: 'agent_xxxxx',
  FALLBACK_NUMBER: '+12063385620',
  SHEET_NAME: 'Call Data',
  
  COLUMNS: {
    MAKE_CALL: 16,           // Column Q
    RESPONSE_CALL_ID_1: 17,  // Column R  
    RESPONSE_CALL_ID_2: 18,  // Column S
    RESPONSE_CALL_ID_3: 19,  // Column T (plumbing/HVAC only)
    CALL_DECLINE_COUNTER: 20 // Column U
  }
};
```

#### Timer Trigger Setup
```javascript
// Create 1-minute timer trigger
ScriptApp.newTrigger('processCallAutomation')
  .timeBased()
  .everyMinutes(1)
  .create();
```

### Error Handling

#### Common Scenarios
- **API Failures**: Falls back to environment variables
- **Invalid Phone Numbers**: Skips call attempt, logs error
- **Call Creation Errors**: Logs error, continues to next row
- **Status Check Failures**: Assumes call ended, continues logic

#### Logging Format
```
[AUTOMATION] Processing EMERGENCY row 5, Call ID: call_original_123
[AUTOMATION] Making first outbound call to +1234567890
[AUTOMATION] Call created successfully: call_outbound_456
[AUTOMATION] Checking call status: ended, transfer detected: false
[AUTOMATION] Making second call after 5-minute delay
```

### Performance Considerations

#### Timing
- **1-minute intervals**: Timer trigger frequency
- **5-minute delays**: Between call attempts  
- **Real-time monitoring**: Call status checks
- **Immediate response**: Transfer detection

#### Scalability
- **Batch processing**: Multiple rows per execution
- **Resource limits**: Google Apps Script 6-minute execution limit
- **Concurrent calls**: Multiple active outbound calls
- **State persistence**: Survives script restarts

### Testing & Debugging

#### Test Functions
```javascript
// Test automation logic
function testCallAutomation() {
  processCallAutomation();
}

// Debug row values
function debugRowValues() {
  // Shows current state of automation columns
}

// Test API connections
function testAPIs() {
  // Verifies external API connectivity
}
```

#### Manual Control
```javascript
// Set emergency for testing
function setEmergencyForTesting() {
  // Configures test row for automation
}

// Reset automation state
function resetAutomationState(rowIndex) {
  // Clears call IDs and counter
}
```

This outbound call automation system provides comprehensive emergency response capabilities with intelligent retry logic, transfer detection, and robust error handling to ensure critical situations receive immediate attention.

## CORS Support

All endpoints include CORS headers:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

OPTIONS requests are handled for CORS preflight checks.

## Performance Characteristics

### Response Times
- **Typical**: 2-5 seconds for successful processing
- **With API calls**: 3-8 seconds including external API queries
- **Cold start**: Additional 1-2 seconds for first request

### Memory Usage
- **Minimal footprint**: Uses Python standard library only
- **Efficient processing**: Optimized for serverless environment
- **No persistent state**: Stateless function design

### Scalability
- **Automatic scaling**: Vercel handles traffic spikes
- **Concurrent processing**: Multiple calls processed simultaneously
- **No bottlenecks**: Each request is independent

All endpoints include CORS headers:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

OPTIONS requests are handled for CORS preflight checks.

## Performance Characteristics

### Response Times
- **Typical**: 2-5 seconds for successful processing
- **With API calls**: 3-8 seconds including external API queries
- **Cold start**: Additional 1-2 seconds for first request

### Memory Usage
- **Minimal footprint**: Uses Python standard library only
- **Efficient processing**: Optimized for serverless environment
- **No persistent state**: Stateless function design

### Scalability
- **Automatic scaling**: Vercel handles traffic spikes
- **Concurrent processing**: Multiple calls processed simultaneously
- **No bottlenecks**: Each request is independent