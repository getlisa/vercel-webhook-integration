# Google Sheets Integration Setup

This guide will help you set up Google Sheets integration to automatically capture call analysis data from Retell AI webhooks.

## 🎯 What This Does

When a `call_analyzed` event is received, the system will:
1. Extract dynamic variables from the call summary using the `extract_variables` function
2. Send the data to Google Sheets including:
   - Call metadata (ID, agent, duration, cost)
   - Analysis results (sentiment, success, summary)
   - Extracted variables (customer name, phone, email, etc.)

## 📋 Setup Steps

### Step 1: Create Google Sheets Spreadsheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new spreadsheet
3. Name it "Retell AI Call Analysis"
4. Copy the spreadsheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit
   ```

### Step 2: Set Up Google Apps Script

1. Go to [Google Apps Script](https://script.google.com)
2. Click "New Project"
3. Replace the default code with the content from `google-apps-script.js`
4. Update the `spreadsheetId` variable with your spreadsheet ID:
   ```javascript
   const spreadsheetId = 'YOUR_SPREADSHEET_ID_HERE';
   ```
5. Save the project (Ctrl+S)

### Step 3: Deploy as Web App

1. Click "Deploy" → "New deployment"
2. Choose type: "Web app"
3. Set execute as: "Me"
4. Set access: "Anyone"
5. Click "Deploy"
6. Copy the Web App URL (it looks like: `https://script.google.com/macros/s/.../exec`)

### Step 4: Configure Vercel Environment

1. Add the Google Sheets URL to your Vercel environment:
   ```bash
   vercel env add GOOGLE_SHEETS_URL
   # Paste your Web App URL when prompted
   ```

2. Redeploy your Vercel app:
   ```bash
   vercel --prod
   ```

### Step 5: Set Up Webhook Routing

You have two options for routing webhook data to Google Sheets:

#### Option A: Dual Webhook Setup (Recommended)
Set up two webhook URLs in Retell AI:
1. `https://your-project.vercel.app/webhook` (main webhook)
2. `https://your-project.vercel.app/sheets` (Google Sheets integration)

#### Option B: Single Webhook with Forwarding
Modify your main webhook to also call the sheets endpoint internally.

## 🧪 Testing

### Test the Google Apps Script
```bash
curl "https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec"
```

### Test the Sheets API Endpoint
```bash
curl -X POST https://your-project.vercel.app/sheets \
  -H "Content-Type: application/json" \
  -d '{
    "event": "call_analyzed",
    "call": {
      "call_id": "test-123",
      "agent_name": "Test Agent",
      "duration_ms": 30000,
      "call_cost": {"combined_cost": 1.50},
      "call_analysis": {
        "user_sentiment": "Positive",
        "call_successful": true,
        "call_summary": "Customer John Smith from ABC Company called about scheduling a service appointment for next Monday. He provided his phone number 555-123-4567 and email john@abc.com. Budget around $500."
      }
    }
  }'
```

## 📊 Extracted Variables

The `extract_variables` function automatically extracts:

| Variable | Description | Example Patterns |
|----------|-------------|------------------|
| `customer_name` | Customer's name | "My name is John Smith" |
| `phone_number` | Phone number | "555-123-4567", "(555) 123-4567" |
| `email` | Email address | "john@company.com" |
| `company` | Company name | "I work at ABC Corp" |
| `appointment_date` | Scheduled date | "Monday the 15th", "12/15/2024" |
| `service_type` | Type of service | "need repair service" |
| `urgency` | Urgency level | "urgent", "no rush" |
| `budget` | Budget amount | "$500", "around $1000" |

## 📈 Google Sheets Columns

Your spreadsheet will have these columns:
- Timestamp
- Call ID
- Agent Name
- Duration (ms)
- Cost ($)
- Sentiment
- Successful
- Call Summary
- Customer Name
- Phone Number
- Email
- Company
- Appointment Date
- Service Type
- Urgency
- Budget

## 🔧 Customization

### Adding New Variables
To extract additional variables, modify the `patterns` dictionary in the `extract_variables` function:

```python
patterns = {
    'your_variable': [
        r'pattern1',
        r'pattern2'
    ]
}
```

### Modifying Google Sheets Structure
Update both:
1. The `headers` array in `google-apps-script.js`
2. The `sheet_data` dictionary in `sheets.py`

## 🚨 Troubleshooting

### Common Issues

1. **"GOOGLE_SHEETS_URL not set"**
   - Make sure you added the environment variable to Vercel
   - Redeploy after adding environment variables

2. **"Failed to send data to Google Sheets"**
   - Check that your Google Apps Script is deployed as a web app
   - Verify the Web App URL is correct
   - Ensure the spreadsheet ID is correct in the script

3. **"Permission denied"**
   - Make sure the Google Apps Script is set to execute as "Me"
   - Check that access is set to "Anyone"

### Viewing Logs

```bash
# View Vercel function logs
vercel logs https://your-project.vercel.app

# Check Google Apps Script logs
# Go to script.google.com → Your project → Executions
```

## 🔐 Security Notes

- The Google Apps Script runs with your Google account permissions
- Only the specific spreadsheet ID you configure will be accessed
- Webhook data is sent over HTTPS
- Consider adding authentication if handling sensitive data

## 📝 Next Steps

1. Set up the Google Sheets integration following this guide
2. Test with sample webhook data
3. Configure Retell AI to send webhooks to your endpoints
4. Monitor the Google Sheets for incoming call analysis data
5. Customize the variable extraction patterns for your specific use case