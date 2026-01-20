# Adaptive Climate Emergency Escalation System

This system provides automated emergency call escalation for Adaptive Climate HVAC services.

## 🚨 Escalation Flow

When an emergency call is received, the system follows this escalation sequence:

1. **Call on-call technician** (from Adaptive Climate API)
2. **Wait 10 minutes** → If no response, call on-call technician again
3. **Wait 10 minutes** → If no response, call **John McLean** (647 544-2606)
4. **Wait 10 minutes** → If no response, call **Alex Kovachev** (647 680-0669)
5. **Wait 10 minutes** → If no response, call **John McLean** (416 402-2601 & 647 544-2606)
6. **Wait 10 minutes** → If no response, call **Brian Kerr** (437 882-5186)
7. **Wait 10 minutes** → If no response, call **John McLean** (647 544-2606) **continuously**

**Note**: If no on-call technician is available, the system starts directly from step 3.

## 📡 API Integration

### Webhook Endpoint
- **File**: `api/sheets4.py`
- **Purpose**: Processes Retell call analysis data for Adaptive Climate
- **API Source**: `https://adaptive-climate.vercel.app/api/assignments`

### Data Flow
1. **Retell** → Webhook receives call analysis
2. **Webhook** → Fetches on-call technician from Adaptive Climate API
3. **Webhook** → Sends data to Google Sheets
4. **Google Apps Script** → Initiates escalation automation if emergency

## 🔧 Setup Instructions

### 1. Deploy Webhook
```bash
# Deploy to Vercel
vercel --prod

# Set environment variable
vercel env add GOOGLE_SHEETS_URL_4
# Enter your Google Apps Script Web App URL
```

### 2. Configure Google Apps Script
1. Create new Google Apps Script project
2. Copy code from `google-apps-script-adaptive-climate.js`
3. Update configuration:
   ```javascript
   const CONFIG = {
     RETELL_API_KEY: 'your_retell_api_key',
     RETELL_AGENT_ID: 'your_agent_id',
     // ... other settings
   };
   ```
4. Deploy as Web App with execute permissions for "Anyone"
5. Copy Web App URL to `GOOGLE_SHEETS_URL_4` environment variable

### 3. Set Up Triggers
Run the `setupTriggers()` function in Google Apps Script to create time-based triggers.

### 4. Configure Retell Webhook
Add your webhook URL to Retell:
```
https://your-deployment.vercel.app/api/sheets4
```

## 📊 Google Sheets Structure

| Column | Field | Description |
|--------|-------|-------------|
| A | Timestamp | When call was received |
| B | Call ID | Retell call identifier |
| C | Agent Name | Retell agent name |
| D | Call Duration | Duration in milliseconds |
| E | User Sentiment | Sentiment analysis |
| F | Call Successful | Boolean success flag |
| G | Call Summary | AI-generated summary |
| H | Transcript | Full call transcript |
| I | From Number | Customer phone number |
| J | Customer Name | Customer name |
| K | Service Address | Service location |
| L | Extracted Call Summary | Extracted summary |
| M | Email | Customer/tech email |
| N | Phone | On-call tech phone |
| O | Tech Name | On-call tech name |
| P | Is Emergency | Emergency flag |
| Q | Emergency Type | Type of emergency |
| **Automation Columns** |
| R | Automation Status | ACTIVE/COMPLETED/ERROR |
| S | Current Step | Current escalation step (1-7) |
| T | Last Call Time | When last call was made |
| U | Next Call Time | When next call is scheduled |
| V | Call Attempts | Number of attempts at current step |
| W | Current Contact | Who is being called |
| X | Call History | Log of all calls made |
| Y | Escalation Complete | Boolean completion flag |

## 🔍 Monitoring

### Check Automation Status
- **ACTIVE**: Escalation in progress
- **COMPLETED**: Escalation finished (someone answered)
- **ERROR**: System error occurred

### Call History Format
```
2024-01-12T10:30:00Z: Called John McLean (+16475442606) - Call initiated
2024-01-12T10:40:00Z: Called Alex Kovachev (+16476800669) - Call initiated
```

## 🧪 Testing

### Test Webhook
```bash
python test_sheets4.py
```

### Test Google Apps Script
1. Run `testEscalation()` function
2. Check logs for execution details
3. Verify sheet updates

### Manual Testing
1. Create test row in Google Sheets
2. Set `Is Emergency` to "Yes"
3. Set `Automation Status` to "ACTIVE"
4. Run `processAllEscalations()` function

## 🚨 Emergency Contacts

| Name | Primary Phone | Secondary Phone | Role |
|------|---------------|-----------------|------|
| On-call Tech | From API | - | First contact |
| John McLean | +1 647 544-2606 | +1 416 402-2601 | Supervisor |
| Alex Kovachev | +1 647 680-0669 | - | Manager |
| Brian Kerr | +1 437 882-5186 | - | Backup |

## 🔧 Configuration

### Environment Variables
- `GOOGLE_SHEETS_URL_4`: Google Apps Script Web App URL
- `FALLBACK_TECH_EMAIL`: Backup email if API fails
- `FALLBACK_TECH_PHONE`: Backup phone if API fails

### Google Apps Script Config
```javascript
const CONFIG = {
  RETELL_API_KEY: 'your_api_key',
  RETELL_AGENT_ID: 'your_agent_id',
  DELAY_MINUTES: 10,
  MAX_RETRIES: 3,
  CONTACTS: {
    JOHN_MCLEAN_PRIMARY: '+16475442606',
    JOHN_MCLEAN_SECONDARY: '+14164022601',
    ALEX_KOVACHEV: '+16476800669',
    BRIAN_KERR: '+14378825186'
  }
};
```

## 📝 Logs

### Webhook Logs
- Variable extraction details
- API call results
- Google Sheets integration status

### Apps Script Logs
- Escalation step progression
- Call initiation results
- Error handling

## 🔄 Troubleshooting

### Common Issues

1. **No on-call tech found**
   - Check Adaptive Climate API response
   - Verify API URL is correct
   - System will start from step 3 (John McLean)

2. **Calls not being made**
   - Verify Retell API key and agent ID
   - Check trigger is running every 5 minutes
   - Ensure automation status is "ACTIVE"

3. **Escalation not progressing**
   - Check `Next Call Time` column
   - Verify time-based trigger is active
   - Review call history for errors

### Debug Steps
1. Check webhook logs in Vercel
2. Review Google Apps Script execution logs
3. Verify Google Sheets data
4. Test API endpoints manually

## 🔐 Security

- API keys stored in Google Apps Script properties
- Webhook uses HTTPS only
- Phone numbers validated before calling
- Call history logged for audit trail