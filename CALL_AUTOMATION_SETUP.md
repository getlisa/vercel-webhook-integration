# Call Automation System Setup Guide

## Overview

This system automatically processes outbound calls based on Google Sheets data, with intelligent retry logic and transfer detection.

## 🚨 Critical Fix Required

**MUST UPDATE WEBHOOK FIRST** to prevent data misalignment:

The Google Apps Script v2 has been updated to append new rows at the bottom instead of inserting at position 2. This prevents the automation columns from getting misaligned when new webhook data arrives.

## Features

- ✅ **5-Minute Intervals**: Processes calls every 5 minutes
- ✅ **Smart Retry Logic**: 2 attempts to tech phone, then fallback
- ✅ **Transfer Detection**: Checks for successful transfer_call invocations
- ✅ **Data Integrity**: Uses Call ID matching to prevent row misalignment
- ✅ **Automatic Cleanup**: Disables automation after success or final attempt

## Sheet Structure

### Existing Columns (0-15):
```
A: Timestamp          I: From Number
B: Call ID            J: Customer Name  
C: Agent Name         K: Service Address
D: Duration (ms)      L: Call Summary (Extracted)
E: Sentiment          M: Email
F: Successful         N: Tech Phone
G: Call Summary       O: Is Emergency
H: Transcript         P: Emergency Type
```

### New Automation Columns (16-19):
```
Q: make_call (boolean)           - Default: true
R: response_call_id_1 (string)   - Default: empty
S: response_call_id_2 (string)   - Default: empty  
T: call_decline_counter (number) - Default: 0
```

## Workflow Logic

### Every 5 Minutes:
1. **Scan Sheet**: Find all rows where `make_call = true` **AND** `Is Emergency = true`
2. **Process Each Row** based on current state:

### State Machine:

```
┌─────────────────────────────────────────────────────────┐
│ EMERGENCY RECORD: make_call=true, is_emergency=true,    │
│ counter=0, no response IDs                              │
└─────────────────────┬───────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────┐
│ ATTEMPT 1: Call tech phone                             │
│ - Set response_call_id_1                               │
│ - Set counter = 1                                      │
└─────────────────────┬───────────────────────────────────┘
                      │ (Next 5-min cycle)
                      ▼
┌─────────────────────────────────────────────────────────┐
│ CHECK 1: Get call status for response_call_id_1        │
├─────────────────────┬───────────────────────────────────┤
│ Transfer Success?   │ No Transfer/Failed?               │
│ make_call = false   │ Make Attempt 2                    │
│ DONE ✅             │ Set response_call_id_2, counter=2 │
└─────────────────────┴─────────────────┬─────────────────┘
                                        │ (Next 5-min cycle)
                                        ▼
┌─────────────────────────────────────────────────────────┐
│ CHECK 2: Get call status for response_call_id_2        │
├─────────────────────┬───────────────────────────────────┤
│ Transfer Success?   │ No Transfer/Failed?               │
│ make_call = false   │ Make Fallback Call                │
│ DONE ✅             │ Call +12063385620                 │
│                     │ make_call = false, DONE ❌        │
└─────────────────────┴───────────────────────────────────┘
```

## API Integration

### Outbound Call (POST):
```javascript
{
  "from_number": "+17789465528",
  "to_number": "TECH_PHONE or +12063385620",
  "override_agent_id": "agent_88461729280fe5f698d7141451",
  "retell_llm_dynamic_variables": {
    "customer_name": "Customer Name",
    "customer_address": "Service Address", 
    "transcript": "Call Transcript",
    "call_summary": "Call Summary",
    "transfer_number": "From Number"
  }
}
```

### Transfer Check (GET):
```
GET /v2/get-call/{call_id}
```
Looks for:
```javascript
{
  "role": "tool_call_invocation",
  "name": "transfer_call",
  "result": { "success": true }
}
```

## Setup Instructions

### 1. Fix Webhook First
The Google Apps Script v2 has been updated. **Redeploy it** to your Google Apps Script project to fix the data shifting issue.

### 2. Add Automation Script
1. Copy `call-automation-system.js` to your Google Apps Script project
2. Update the `CONFIG` object column indices to match your sheet
3. Set Script Properties:
   - `RETELL_API_KEY`: Your Retell AI API key

### 3. Run Setup
```javascript
setupCallAutomation()
```
This will:
- Add the 4 new columns with headers
- Set default values for existing rows
- Create the 5-minute timer trigger

### 4. Test
```javascript
testCallAutomation()
```

## Configuration

Update these values in the `CONFIG` object:

```javascript
const CONFIG = {
  RETELL_API_KEY: 'YOUR_API_KEY',
  FROM_NUMBER: '+17789465528',
  AGENT_ID: 'agent_88461729280fe5f698d7141451', 
  FALLBACK_NUMBER: '+12063385620',
  SHEET_NAME: 'Sheet1',
  
  COLUMNS: {
    CALL_ID: 1,              // Column B
    CUSTOMER_NAME: 9,        // Column J
    SERVICE_ADDRESS: 10,     // Column K
    TRANSCRIPT: 7,           // Column H
    CALL_SUMMARY: 6,         // Column G
    FROM_NUMBER: 8,          // Column I
    TECH_PHONE: 13,          // Column N
    IS_EMERGENCY: 14,        // Column O
    
    MAKE_CALL: 16,           // Column Q
    RESPONSE_CALL_ID_1: 17,  // Column R
    RESPONSE_CALL_ID_2: 18,  // Column S
    CALL_DECLINE_COUNTER: 19 // Column T
  }
};
```

## Monitoring

### Column Values to Watch:
- **make_call**: `true` = active, `false` = completed/disabled
- **call_decline_counter**: `0` = new, `1` = first attempt, `2` = second attempt
- **response_call_id_1/2**: Populated with Retell call IDs

### Logs:
Check Google Apps Script execution logs for:
- Call creation confirmations
- Transfer detection results
- Error messages

## Troubleshooting

### Common Issues:

1. **Data Misalignment**
   - Ensure webhook appends rows (not inserts at position 2)
   - Check column indices in CONFIG

2. **Calls Not Being Made**
   - Verify `make_call = true` in sheet
   - Check API key in Script Properties
   - Review execution logs

3. **Transfer Not Detected**
   - Verify agent has transfer_call tool
   - Check call logs in Retell dashboard
   - Ensure sufficient time for call completion

### Manual Testing:
```javascript
// Test single row processing
const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Sheet1');
const rowData = sheet.getRange(2, 1, 1, 20).getValues()[0];
processCallRow(sheet, 2, rowData);
```

## Security Notes

- Store API keys in Script Properties, not code
- Monitor execution logs for errors
- Set up error notifications if needed
- Use least-privilege API keys

## Performance

- Processes all rows in batches for efficiency
- 5-minute intervals prevent API rate limiting
- Automatic cleanup prevents infinite loops