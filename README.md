# Retell AI Google Sheets Integration

A comprehensive serverless webhook system that integrates Retell AI voice agents with Google Sheets for automated call data collection and analysis. This system supports multiple specialized endpoints for different business use cases including fire safety, plumbing/HVAC services, and general call automation.

## 🏗️ Project Architecture

```
vercel-webhook/
├── api/
│   ├── sheets2.py              # Fire safety integration (Fire Alarm/Sprinkler)
│   └── sheets3.py              # Plumbing/HVAC integration
├── google-apps-script-v3.js    # Fire safety Google Apps Script
├── google-apps-script-v4.js    # Plumbing/HVAC Google Apps Script
├── google-apps-script-plumbing-automation.js  # Plumbing automation script
├── call-automation-system.js   # Call automation system v1
├── call-automation-system-v2.js # Call automation system v2
├── docs/
│   ├── INTEGRATION_SUMMARY.md  # Complete integration overview
│   ├── SETUP_YOUR_SHEETS.md    # Google Sheets setup guide
│   ├── GOOGLE_SHEETS_SETUP.md  # Detailed Google Sheets configuration
│   ├── CALL_AUTOMATION_SETUP.md # Call automation setup
│   └── FINAL_SETUP_STEPS.md    # Final configuration steps
├── .env.example                # Environment variables template
├── requirements.txt            # Python dependencies (minimal)
├── vercel.json                 # Vercel deployment configuration
└── README.md                   # This documentation
```

## 🚀 Features

### Multi-Service Integration
- **Fire Safety Services** - Fire alarm and sprinkler system integration
- **Plumbing/HVAC Services** - Plumbing and HVAC emergency response
- **General Call Automation** - Flexible call processing system

### Smart Data Processing
- **Multi-source Variable Extraction** - Extracts data from 5+ locations in Retell AI payload
- **Emergency Type Detection** - Routes calls based on emergency type
- **Tech Assignment Integration** - Automatically fetches technician data from external APIs
- **Intelligent Fallbacks** - Robust fallback logic for missing data

### Outbound Call Automation
- **Automated Emergency Calls** - Makes outbound calls to technicians for emergency situations
- **Multi-attempt Logic** - Up to 3 call attempts with 5-minute delays between attempts
- **Transfer Detection** - Monitors for successful call transfers to stop automation
- **Fallback Calling** - Uses fallback numbers when primary tech numbers fail
- **Call Status Monitoring** - Tracks call progress and completion status

### Reliability Features
- **Content-based Deduplication** - Prevents duplicate processing using MD5 hashing
- **Comprehensive Error Handling** - Graceful failure handling with detailed logging
- **Health Check Endpoints** - Easy monitoring and status verification
- **CORS Support** - Cross-origin request handling

## 📋 Available Endpoints

### 1. Fire Safety Integration (`/api/sheets2`)
**Purpose**: Handles fire alarm and sprinkler system calls

**Variables Extracted**:
- `fromNumber` - Caller's phone number
- `customerName` - Customer name
- `serviceAddress` - Service location address
- `callSummary` - Call summary
- `email` - Contact email (from API or extracted)
- `isitEmergency` - Emergency flag
- `emergencyType` - Type of emergency (Fire Alarm/Sprinkler)

**External APIs**:
- Fire Alarm API: `https://fire-alarm-men6qqx0l-mahees-projects-2df6704a.vercel.app/api/assignments`
- Sprinkler API: `https://sprinkler-p52oxcmyy-mahees-projects-2df6704a.vercel.app/api/assignments`

### 2. Plumbing/HVAC Integration (`/api/sheets3`)
**Purpose**: Handles plumbing and HVAC service calls

**Variables Extracted**:
- `fromNumber` - Caller's phone number
- `customerName` - Customer name
- `serviceAddress` - Service location address
- `callSummary` - Call summary
- `email` - Contact email (from API or extracted)
- `isitEmergency` - Emergency flag
- `emergencyType` - Type of emergency (Plumbing/HVAC)

**External APIs**:
- Plumbing API: `https://plumbing-api.vercel.app/api/assignments`
- HVAC API: `https://hvacapi.vercel.app/api/assignments`

## 🔧 Setup & Configuration

### 1. Environment Variables

Create a `.env` file or set in Vercel:

```bash
# Google Sheets URLs (from Google Apps Script Web Apps)
GOOGLE_SHEETS_URL_2=https://script.google.com/macros/s/.../exec  # Fire safety
GOOGLE_SHEETS_URL_3=https://script.google.com/macros/s/.../exec  # Plumbing/HVAC

# Fallback technician data (optional)
FALLBACK_TECH_EMAIL=fallback@company.com
FALLBACK_TECH_PHONE=+1234567890
```

### 2. Google Sheets Setup

#### For Fire Safety (sheets2):
1. Create Google Spreadsheet for fire safety calls
2. Copy `google-apps-script-v3.js` to Google Apps Script
3. Update `SPREADSHEET_ID` in the script
4. Deploy as Web App
5. Set `GOOGLE_SHEETS_URL_2` environment variable

#### For Plumbing/HVAC (sheets3):
1. Create Google Spreadsheet for plumbing/HVAC calls
2. Copy `google-apps-script-v4.js` to Google Apps Script
3. Update `SPREADSHEET_ID` in the script
4. Deploy as Web App
5. Set `GOOGLE_SHEETS_URL_3` environment variable

### 3. Deploy to Vercel

```bash
cd vercel-webhook
vercel --prod
```

### 4. Configure Retell AI

#### For Fire Safety Webhook:
- Webhook URL: `https://your-deployment.vercel.app/api/sheets2`
- Required variables: `fromNumber`, `customerName`, `serviceAddress`, `emergencyType`

#### For Plumbing/HVAC Webhook:
- Webhook URL: `https://your-deployment.vercel.app/api/sheets3`
- Required variables: `fromNumber`, `customerName`, `serviceAddress`, `emergencyType`

## 🔍 API Reference

### Health Check Endpoints

**GET** `/api/sheets2`
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

**GET** `/api/sheets3`
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

### Webhook Processing

**POST** `/api/sheets2` or `/api/sheets3`

**Request Body**: Retell AI `call_analyzed` event payload

**Response Codes**:
- `200` - Success or skipped (duplicate/ignored)
- `400` - Invalid JSON payload
- `500` - Internal server error

**Success Response**:
```json
{
  "status": "success",
  "message": "Data sent to Google Sheets v2",
  "call_id": "call_xxxxx",
  "extracted_variables": {
    "fromNumber": "+1234567890",
    "customerName": "John Doe",
    "serviceAddress": "123 Main St",
    "emergencyType": "Fire Alarm"
  },
  "tech_data": {
    "name": "John Smith",
    "email": "tech@company.com",
    "phone": "+1987654321"
  }
}
```

## 🔄 Data Flow

### Inbound Call Processing Flow
```
1. Retell AI Call Ends
2. call_analyzed Event Sent
3. Extract Variables from Multiple Sources
4. Determine Emergency Type
5. Query Appropriate Tech API
6. Combine Call Data + Variables + Tech Data
7. Send to Google Sheets
8. Return Success/Error Response
```

### Outbound Call Automation Flow
```
1. Google Apps Script Timer (Every 1 minute)
2. Check Rows with make_call=true AND is_emergency=true
3. Determine Call Attempt Stage (counter 0, 1, 2, or 3)
4. Make Outbound Call via Retell AI API
5. Monitor Call Status and Transfer Detection
6. Wait 5 minutes between attempts
7. Disable automation after successful transfer or final attempt
```

### Call Automation Logic
- **First Attempt (counter=0)**: Call tech phone number
- **Second Attempt (counter=1)**: Wait 5 minutes after first call ends, call tech phone again
- **Third Attempt (counter=2)**: Wait 5 minutes after second call ends, call tech phone again (plumbing/HVAC only)
- **Fallback Attempt**: Call fallback number from external API or environment variable
- **Transfer Detection**: Stop automation if transfer_call tool is invoked during any call

### Variable Extraction Sources (Priority Order)
1. **collected_dynamic_variables** - Primary Retell AI variables
2. **custom_analysis_data** - Custom analysis results
3. **transcript_with_tool_calls** - Tool call results
4. **tool_call_result** - Any tool call results
5. **Direct fields** - Direct call_data fields (fallback)

### Tech API Integration
- **Emergency Type Detection**: Routes to appropriate API based on `emergencyType`
- **Fallback Logic**: If primary API fails, tries secondary API
- **Environment Fallbacks**: Uses environment variables if APIs unavailable

## 📞 Outbound Call Automation

### Overview
The system includes sophisticated outbound call automation that automatically makes emergency calls to technicians when urgent situations are detected. This is implemented through Google Apps Script with time-based triggers.

### Automation Trigger Conditions
- **make_call** = true (or null/empty)
- **is_emergency** = true (or "yes", "YES", 1)

### Call Attempt Logic

#### Fire Safety (2 attempts + fallback)
1. **First Attempt**: Call tech phone number
2. **Second Attempt**: After 5-minute delay, call tech phone again
3. **Fallback Attempt**: Call fallback number from ServiceTrade API

#### Plumbing/HVAC (3 attempts + fallback)
1. **First Attempt**: Call tech phone number
2. **Second Attempt**: After 5-minute delay, call tech phone again
3. **Third Attempt**: After 5-minute delay, call tech phone again
4. **Fallback Attempt**: Call fallback number from Plumbing/HVAC APIs

### Transfer Detection
- Monitors each call for `transfer_call` tool invocation
- Stops automation immediately if transfer is successful
- Continues to next attempt if no transfer detected

### Call Status Monitoring
- Checks call status before making next attempt
- Waits for ongoing calls to complete
- Enforces 5-minute delay between attempts
- Tracks call progress with detailed logging

### Dynamic Phone Number Resolution
- **Tech Phone**: Uses phone from Google Sheets tech data
- **Fallback Numbers**: Fetches from external APIs based on emergency type
- **Phone Formatting**: Automatically formats to +1XXXXXXXXXX format
- **API Integration**: ServiceTrade API for fire safety, Plumbing/HVAC APIs for plumbing

### Automation Control
- **Automatic Enablement**: New emergency rows automatically get make_call=true
- **Automatic Disablement**: Stops after successful transfer or final attempt
- **Manual Control**: Can be manually disabled by setting make_call=false
- **Counter Tracking**: call_decline_counter tracks attempt number

## 📊 Google Sheets Output

### Fire Safety Sheet Columns
- Timestamp, Call ID, Agent Name, Duration, Sentiment, Success
- Call Summary, From Number, Customer Name, Service Address
- Email, Phone, Is Emergency, Emergency Type, Transcript
- Automation columns: make_call, response_call_id_1-3, call_decline_counter

### Plumbing/HVAC Sheet Columns
- Same structure as Fire Safety
- Optimized for plumbing and HVAC service calls
- Color-coded emergency types for visual distinction
- Additional response_call_id_3 column for extended retry logic

### Outbound Call Automation Columns
- **make_call** - Boolean flag to enable/disable automation for each row
- **response_call_id_1** - First outbound call ID
- **response_call_id_2** - Second outbound call ID (fire safety)
- **response_call_id_3** - Third outbound call ID (plumbing/HVAC only)
- **call_decline_counter** - Tracks number of call attempts made

## 🛡️ Security & Reliability

### Deduplication System
- **Content-based Hashing**: MD5 hash of call_id + variables + timestamp
- **Automatic Cleanup**: Removes entries older than 24 hours
- **Size Management**: Keeps only 1000 most recent entries

### Error Handling
- **Graceful Failures**: Continues processing even if external APIs fail
- **Detailed Logging**: Comprehensive logging with prefixed messages
- **Partial Success**: Returns success even if some operations fail

### Performance
- **Serverless Architecture**: Automatic scaling with Vercel
- **Minimal Dependencies**: Uses Python standard library only
- **Efficient Processing**: Optimized for sub-10 second response times

## 🧪 Testing

### Health Check Tests
```bash
# Test fire safety endpoint
curl https://your-deployment.vercel.app/api/sheets2

# Test plumbing/HVAC endpoint
curl https://your-deployment.vercel.app/api/sheets3
```

### End-to-End Tests
```bash
# Test fire safety integration
curl -X POST https://your-deployment.vercel.app/api/sheets2 \
  -H "Content-Type: application/json" \
  -d '{
    "event": "call_analyzed",
    "call": {
      "call_id": "test_fire_123",
      "collected_dynamic_variables": {
        "fromNumber": "+1234567890",
        "customerName": "John Doe",
        "serviceAddress": "123 Fire St",
        "emergencyType": "Fire Alarm"
      },
      "call_analysis": {
        "call_summary": "Fire alarm system needs inspection"
      }
    }
  }'

# Test plumbing/HVAC integration
curl -X POST https://your-deployment.vercel.app/api/sheets3 \
  -H "Content-Type: application/json" \
  -d '{
    "event": "call_analyzed",
    "call": {
      "call_id": "test_plumbing_123",
      "collected_dynamic_variables": {
        "fromNumber": "+1234567890",
        "customerName": "Jane Smith",
        "serviceAddress": "456 Plumbing Ave",
        "emergencyType": "Plumbing"
      },
      "call_analysis": {
        "call_summary": "Plumbing emergency - burst pipe"
      }
    }
  }'
```

## 📈 Monitoring & Analytics

### View Logs
```bash
# View all logs
vercel logs https://your-deployment.vercel.app

# Filter by endpoint
vercel logs https://your-deployment.vercel.app | grep SHEETS2
vercel logs https://your-deployment.vercel.app | grep SHEETS3
```

### Google Sheets Analytics
- **Call Volume**: Track calls by emergency type
- **Response Times**: Monitor technician assignment efficiency
- **Success Rates**: Analyze call completion rates
- **Geographic Distribution**: Map service addresses

## 🔧 Customization

### Adding New Variables
Edit the `extract_variables_v2()` or `extract_variables_v3()` functions:
```python
variables = {
    'existing_var': '',
    'new_variable': '',  # Add new variable
    # ... other variables
}
```

### Adding New APIs
Modify the `get_tech_data_from_api()` function:
```python
# Add new API endpoint
new_api = "https://new-service-api.vercel.app/api/assignments"

# Add to emergency type logic
if emergency_type == 'NewType':
    primary_api = new_api
    primary_name = "NEW API"
```

### Custom Google Sheets Formatting
Update the corresponding Google Apps Script files:
- `google-apps-script-v3.js` for fire safety
- `google-apps-script-v4.js` for plumbing/HVAC

## 📚 Documentation Files

- **INTEGRATION_SUMMARY.md** - Complete integration overview
- **SETUP_YOUR_SHEETS.md** - Google Sheets setup guide
- **GOOGLE_SHEETS_SETUP.md** - Detailed Google Sheets configuration
- **CALL_AUTOMATION_SETUP.md** - Call automation setup
- **FINAL_SETUP_STEPS.md** - Final configuration steps

## 🚀 Deployment URLs

After deployment, your endpoints will be:
```
Fire Safety: https://your-deployment.vercel.app/api/sheets2
Plumbing/HVAC: https://your-deployment.vercel.app/api/sheets3
Health Checks: GET requests to the same URLs
```

## 🔗 Related Projects

- **comfitrust-webhook** - ComfiTrust CRM integration
- **buildops** - BuildOps integration
- **adaptive-climate** - Adaptive Climate integration

## 📄 License

This project is part of the Retell AI integration suite for automated call processing and data collection.

---

This comprehensive Google Sheets integration system provides automated call data collection, intelligent technician assignment, and real-time analytics for fire safety and plumbing/HVAC services. The serverless architecture ensures scalability and reliability while the smart data processing capabilities maximize the value extracted from each call.