# Vercel Webhook Troubleshooting Guide

## Quick Diagnostics

### 1. Health Check
```bash
# Test fire safety endpoint
curl https://your-deployment.vercel.app/api/sheets2

# Test plumbing/HVAC endpoint
curl https://your-deployment.vercel.app/api/sheets3

# Expected: 200 OK with JSON response showing "status": "healthy"
```

### 2. Check Logs
```bash
# View recent logs
vercel logs https://your-deployment.vercel.app --since=1h

# Filter by endpoint
vercel logs https://your-deployment.vercel.app | grep SHEETS2
vercel logs https://your-deployment.vercel.app | grep SHEETS3

# Filter errors only
vercel logs https://your-deployment.vercel.app | grep ERROR
```

### 3. Verify Environment Variables
```bash
# List all environment variables
vercel env ls

# Should show: GOOGLE_SHEETS_URL_2, GOOGLE_SHEETS_URL_3, and optional fallback variables
```

## Common Issues & Solutions

### Google Sheets Integration Problems

#### Issue: "GOOGLE_SHEETS_URL_2 environment variable not set"

**Symptoms:**
```json
{
  "status": "partial_success",
  "message": "Data processing completed but response generation failed",
  "error": "GOOGLE_SHEETS_URL_2 environment variable not set"
}
```

**Solutions:**

1. **Add Missing Environment Variable:**
   ```bash
   # Via CLI
   vercel env add GOOGLE_SHEETS_URL_2
   # Enter your Google Apps Script Web App URL
   
   # Via Dashboard
   # Go to Vercel Dashboard → Project → Settings → Environment Variables
   # Add GOOGLE_SHEETS_URL_2 with your Web App URL
   
   # Redeploy
   vercel --prod
   ```

2. **Verify Google Apps Script Web App URL:**
   - URL should end with `/exec`
   - Test the URL directly: `curl "YOUR_WEB_APP_URL"`
   - Should return JSON response

#### Issue: Google Sheets not updating despite successful webhook response

**Diagnosis:**
```bash
# Check if data is being sent to Google Sheets
vercel logs https://your-deployment.vercel.app | grep "Data sent successfully"

# Check Google Apps Script execution logs
# Go to script.google.com → Your project → Executions tab
```

**Solutions:**

1. **Check Google Apps Script Permissions:**
   - Go to Google Apps Script project
   - Ensure deployment settings:
     - Execute as: **Me**
     - Who has access: **Anyone**
   - Redeploy if settings were wrong

2. **Verify Spreadsheet ID:**
   ```javascript
   // In your Google Apps Script, check:
   const SPREADSHEET_ID = 'your-actual-spreadsheet-id';
   
   // Get ID from spreadsheet URL:
   // https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
   ```

3. **Test Google Apps Script Directly:**
   ```bash
   # Test the Web App URL
   curl -X POST "YOUR_WEB_APP_URL" \
     -H "Content-Type: application/json" \
     -d '{"test": "data"}'
   ```

4. **Check Google Apps Script Logs:**
   - Go to script.google.com
   - Open your project
   - Click "Executions" tab
   - Look for errors or failed executions

#### Issue: "Failed to send data" to Google Sheets

**Symptoms:**
```
[SHEETS2 ERROR] Failed to send data: <urlopen error [SSL: CERTIFICATE_VERIFY_FAILED]>
```

**Solutions:**

1. **SSL Certificate Issues:**
   - This is handled in the code with SSL context
   - Check if Google Apps Script Web App URL is correct
   - Ensure URL uses HTTPS

2. **Network Timeout:**
   ```bash
   # Check if Google services are accessible
   curl -I "https://script.google.com"
   
   # Test your specific Web App URL
   curl -I "YOUR_WEB_APP_URL"
   ```

### Variable Extraction Issues

#### Issue: No variables extracted from call data

**Symptoms:**
```
[SHEETS2 API] ERROR: No variables extracted for call call_xxxxx
```

**Diagnosis:**
```bash
# Look for variable extraction debug logs
vercel logs https://your-deployment.vercel.app | grep "collected_dynamic_variables"
vercel logs https://your-deployment.vercel.app | grep "FINAL EXTRACTED VARIABLES"
```

**Solutions:**

1. **Check Retell AI Agent Configuration:**
   - Verify dynamic variables are configured in Retell AI
   - Ensure variable names match exactly:
     - `fromNumber` (not `from_number` or `phoneNumber`)
     - `customerName` (not `customer_name` or `name`)
     - `serviceAddress` (not `address` or `service_address`)
     - `emergencyType` (not `emergency_type` or `type`)

2. **Test Variable Extraction:**
   ```python
   # Create test payload with your variables
   test_payload = {
     "event": "call_analyzed",
     "call": {
       "call_id": "test_123",
       "collected_dynamic_variables": {
         "fromNumber": "+1234567890",
         "customerName": "Test User",
         "serviceAddress": "123 Test St",
         "emergencyType": "Fire Alarm"
       }
     }
   }
   ```

3. **Check Variable Extraction Sources:**
   The system checks these locations in order:
   - `collected_dynamic_variables` (primary)
   - `custom_analysis_data`
   - `transcript_with_tool_calls`
   - `tool_call_result`
   - Direct fields in `call_data`

#### Issue: Variables extracted but wrong values

**Diagnosis:**
```bash
# Check what variables are being extracted
vercel logs https://your-deployment.vercel.app | grep "FINAL EXTRACTED VARIABLES"
```

**Solutions:**

1. **Verify Retell AI Agent Training:**
   - Ensure agent is trained to capture correct information
   - Test with sample calls to verify variable extraction
   - Check variable descriptions in Retell AI configuration

2. **Debug Variable Sources:**
   ```bash
   # Look for debug logs showing where variables came from
   vercel logs https://your-deployment.vercel.app | grep "collected_dynamic_variables:"
   ```

### External API Integration Issues

#### Issue: Tech data not being fetched from external APIs

**Symptoms:**
```
[API] No email or phone found from either API
[SHEETS2] Tech data from API: {'email': '', 'phone': ''}
```

**Diagnosis:**
```bash
# Check API call logs
vercel logs https://your-deployment.vercel.app | grep "API"
vercel logs https://your-deployment.vercel.app | grep "Trying API"
```

**Solutions:**

1. **Test External APIs Directly:**
   ```bash
   # Fire safety APIs
   curl https://fire-alarm-men6qqx0l-mahees-projects-2df6704a.vercel.app/api/assignments
   curl https://sprinkler-p52oxcmyy-mahees-projects-2df6704a.vercel.app/api/assignments
   
   # Plumbing/HVAC APIs
   curl https://plumbing-api.vercel.app/api/assignments
   curl https://hvacapi.vercel.app/api/assignments
   ```

2. **Check API Response Format:**
   Expected format:
   ```json
   {
     "assignments": [
       {
         "techs": [
           {
             "email": "tech@company.com",
             "phone": "+1234567890"
           }
         ]
       }
     ]
   }
   ```

3. **Set Fallback Environment Variables:**
   ```bash
   vercel env add FALLBACK_TECH_EMAIL
   # Enter: fallback@company.com
   
   vercel env add FALLBACK_TECH_PHONE
   # Enter: +1234567890
   
   vercel --prod
   ```

4. **Check Emergency Type Logic:**
   ```bash
   # Look for emergency type detection logs
   vercel logs https://your-deployment.vercel.app | grep "Emergency type detected"
   ```

#### Issue: Wrong API being called for emergency type

**Symptoms:**
```
[API] Emergency type is 'Fire Alarm' - trying Sprinkler API first
```

**Solutions:**

1. **Verify Emergency Type Values:**
   - Fire Safety: "Fire Alarm" or "Sprinkler"
   - Plumbing/HVAC: "Plumbing" or "HVAC"
   - Values are case-sensitive

2. **Check API Priority Logic:**
   ```python
   # Fire Safety (sheets2):
   # If emergencyType == 'Sprinkler': Try Sprinkler API first
   # If emergencyType == 'Fire Alarm' or empty: Try Fire Alarm API first
   
   # Plumbing/HVAC (sheets3):
   # If emergencyType == 'Plumbing': Try Plumbing API first
   # If emergencyType == 'HVAC' or empty: Try HVAC API first
   ```

### Webhook Delivery Issues

#### Issue: Retell AI not sending webhooks

**Symptoms:**
- No webhook calls in logs
- Events not being processed
- Webhook appears inactive

**Diagnosis:**

1. **Check Retell AI Configuration:**
   - Verify webhook URL is correct
   - Confirm `call_analyzed` event is selected
   - Test webhook endpoint manually

2. **Test Webhook URL:**
   ```bash
   # Test webhook receives requests
   curl -X POST https://your-deployment.vercel.app/api/sheets2 \
     -H "Content-Type: application/json" \
     -d '{"event":"test","call":{"call_id":"test"}}'
   ```

3. **Check Retell AI Logs:**
   - Look for webhook delivery failures in Retell AI dashboard
   - Verify agent is configured correctly
   - Check for network/DNS issues

#### Issue: Duplicate webhooks being processed

**Symptoms:**
- Multiple entries for same call in Google Sheets
- Duplicate processing attempts
- Deduplication not working

**Solutions:**

1. **Check Deduplication Logic:**
   ```bash
   # Look for duplicate detection logs
   vercel logs https://your-deployment.vercel.app | grep "duplicate"
   vercel logs https://your-deployment.vercel.app | grep "Found duplicate hash"
   ```

2. **Verify Hash Generation:**
   - Check if call data is consistent
   - Verify timestamp rounding logic
   - Test with identical payloads

3. **Clean Processed Calls:**
   ```python
   # Deduplication files location
   PROCESSED_CALLS_FILE = '/tmp/processed_calls_sheets2.json'
   PROCESSED_CALLS_FILE = '/tmp/processed_calls_sheets3.json'
   
   # Files are automatically cleaned but can be manually cleared
   ```

### Performance Issues

#### Issue: Webhook timeouts

**Symptoms:**
- 504 Gateway Timeout errors
- Slow response times
- Incomplete processing

**Solutions:**

1. **Optimize External API Calls:**
   - Reduce API timeout from 10 seconds if needed
   - Implement connection pooling
   - Add request timeouts

2. **Check Vercel Limits:**
   - Hobby plan: 10-second timeout
   - Pro plan: 60-second timeout
   - Upgrade if needed

3. **Monitor Performance:**
   ```bash
   # Check function execution time
   vercel logs https://your-deployment.vercel.app | grep "Duration"
   ```

#### Issue: High memory usage

**Solutions:**

1. **Optimize Data Processing:**
   - Process data in chunks
   - Clear large variables after use
   - Avoid loading entire payloads into memory

2. **Monitor Memory:**
   - Check Vercel dashboard for memory usage
   - Upgrade plan if consistently hitting limits

### Google Apps Script Issues

#### Issue: "Script function not found" or "Permission denied"

**Solutions:**

1. **Check Script Deployment:**
   - Ensure script is deployed as Web App
   - Verify deployment settings:
     - Type: Web app
     - Execute as: Me
     - Who has access: Anyone

2. **Reauthorize Script:**
   - Go to Google Apps Script project
   - Run any function manually to trigger authorization
   - Grant necessary permissions

3. **Check Script Syntax:**
   - Ensure no syntax errors in Google Apps Script
   - Test script functions manually

#### Issue: "Spreadsheet not found" in Google Apps Script

**Solutions:**

1. **Verify Spreadsheet ID:**
   ```javascript
   // Check SPREADSHEET_ID in your script
   const SPREADSHEET_ID = 'your-actual-spreadsheet-id';
   
   // Get from URL: https://docs.google.com/spreadsheets/d/ID/edit
   ```

2. **Check Permissions:**
   - Ensure you have edit access to the spreadsheet
   - Verify spreadsheet exists and is not deleted

3. **Test Spreadsheet Access:**
   ```javascript
   // Add this test function to your Google Apps Script
   function testSpreadsheetAccess() {
     try {
       const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
       console.log('Spreadsheet name:', spreadsheet.getName());
     } catch (error) {
       console.error('Error accessing spreadsheet:', error);
     }
   }
   ```

## Debugging Tools

### Enable Debug Logging

Add debug prints to troubleshoot specific issues:

```python
# Add to webhook code for debugging
import json

def debug_payload(call_data):
    print(f"[DEBUG] Full call_data keys: {list(call_data.keys())}")
    print(f"[DEBUG] collected_dynamic_variables: {call_data.get('collected_dynamic_variables', {})}")
    print(f"[DEBUG] call_analysis: {call_data.get('call_analysis', {})}")
```

### Test Scripts

Create test scripts for specific components:

```python
# test_variable_extraction.py
from api.sheets2 import extract_variables_v2

test_data = {
    "collected_dynamic_variables": {
        "fromNumber": "+1234567890",
        "customerName": "Test User",
        "serviceAddress": "123 Test St",
        "emergencyType": "Fire Alarm"
    }
}

result = extract_variables_v2(test_data)
print(f"Extracted: {result}")
```

### Manual Testing

```bash
# Test with curl
curl -X POST https://your-deployment.vercel.app/api/sheets2 \
  -H "Content-Type: application/json" \
  -d '{
    "event": "call_analyzed",
    "call": {
      "call_id": "manual_test",
      "collected_dynamic_variables": {
        "fromNumber": "+1234567890",
        "customerName": "Manual Test",
        "serviceAddress": "123 Test Street",
        "emergencyType": "Fire Alarm"
      },
      "call_analysis": {
        "call_summary": "Manual test call"
      },
      "transcript": "This is a manual test call",
      "start_timestamp": 1704462000000
    }
  }'
```

## Getting Help

### Log Analysis

When reporting issues, include:

1. **Webhook URL and endpoint**
2. **Relevant log entries:**
   ```bash
   vercel logs https://your-deployment.vercel.app --since=1h | grep SHEETS2
   ```
3. **Sample payload that failed**
4. **Expected vs actual behavior**
5. **Environment variable configuration (without sensitive data)**

### Google Apps Script Debugging

1. **Check Execution Logs:**
   - Go to script.google.com
   - Open your project
   - Click "Executions" tab
   - Look for failed executions

2. **Test Functions Manually:**
   - Select a function in the editor
   - Click "Run" to test manually
   - Check console output for errors

### Contact Information

- **Vercel Issues:** [Vercel Support](https://vercel.com/support)
- **Google Apps Script:** [Google Apps Script Help](https://developers.google.com/apps-script/support)
- **Retell AI:** [Retell AI Documentation](https://docs.retellai.com)

### Useful Resources

- [Google Apps Script Documentation](https://developers.google.com/apps-script)
- [Google Sheets API Documentation](https://developers.google.com/sheets/api)
- [Retell AI Webhook Guide](https://docs.retellai.com/webhooks)
- [Vercel Serverless Functions](https://vercel.com/docs/functions)
- [Python urllib Documentation](https://docs.python.org/3/library/urllib.html)

## Emergency Procedures

### If Google Sheets Stop Updating

1. **Check Google Apps Script Status:**
   ```bash
   curl "YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL"
   ```

2. **Redeploy Google Apps Script:**
   - Go to script.google.com
   - Open your project
   - Deploy → Manage deployments
   - Create new deployment

3. **Update Environment Variable:**
   ```bash
   vercel env rm GOOGLE_SHEETS_URL_2
   vercel env add GOOGLE_SHEETS_URL_2
   # Enter new Web App URL
   vercel --prod
   ```

### If External APIs Are Down

1. **Set Fallback Environment Variables:**
   ```bash
   vercel env add FALLBACK_TECH_EMAIL
   vercel env add FALLBACK_TECH_PHONE
   vercel --prod
   ```

2. **Monitor API Status:**
   ```bash
   # Check API health
   curl -I https://fire-alarm-men6qqx0l-mahees-projects-2df6704a.vercel.app/api/assignments
   curl -I https://plumbing-api.vercel.app/api/assignments
   ```

### If Vercel Deployment Fails

1. **Check Build Logs:**
   ```bash
   vercel logs https://your-deployment.vercel.app --since=10m
   ```

2. **Rollback to Previous Deployment:**
   - Go to Vercel Dashboard
   - Select your project
   - Go to "Deployments" tab
   - Find previous working deployment
   - Click "Promote to Production"

3. **Redeploy from Scratch:**
   ```bash
   vercel --prod --force
   ```