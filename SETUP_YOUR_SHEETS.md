# 🚀 Setup Guide for Your Google Sheets

## Your Spreadsheet
**URL:** https://docs.google.com/spreadsheets/d/14AOSf9cS_J_JnWbxT3_wg_wRUeOSMaCvFRE1iEhoGMU/edit?usp=sharing
**ID:** `14AOSf9cS_J_JnWbxT3_wg_wRUeOSMaCvFRE1iEhoGMU`

## 📋 Step-by-Step Setup

### Step 1: Set Up Google Apps Script

1. **Go to Google Apps Script:**
   - Visit: https://script.google.com/
   - Click "New Project"

2. **Replace Default Code:**
   - Delete all existing code
   - Copy and paste the entire content from `google-apps-script.js`
   - The spreadsheet ID is already configured for your sheet

3. **Save the Project:**
   - Press `Ctrl+S` (or `Cmd+S` on Mac)
   - Name it: "Retell Webhook Handler"

### Step 2: Deploy as Web App

1. **Click "Deploy" → "New deployment"**
2. **Choose type:** "Web app"
3. **Configuration:**
   - Execute as: **Me**
   - Who has access: **Anyone**
4. **Click "Deploy"**
5. **Copy the Web App URL** (looks like: `https://script.google.com/macros/s/AKfycby.../exec`)

### Step 3: Add URL to Vercel

```bash
vercel env add GOOGLE_SHEETS_URL
# Paste your Web App URL when prompted
```

### Step 4: Redeploy Vercel

```bash
vercel --prod
```

## 🧪 Test the Integration

### Test 1: Check Google Apps Script
```bash
curl "YOUR_WEB_APP_URL_HERE"
```

### Test 2: Test the Sheets API
```bash
curl -X POST https://amera-m3jodk3pc-mahees-projects-2df6704a.vercel.app/api/sheets \
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
        "call_summary": "Test call summary"
      },
      "firstName": "John",
      "lastName": "Smith",
      "email": "john@test.com",
      "description": "Medical appointment",
      "facilityName": "Test Hospital",
      "doctorName": "Dr. Johnson",
      "facilitynumber": "Room 101",
      "pickupLoc": "123 Main St",
      "dropLocation": "Test Hospital",
      "appointmentDate": "Monday 2PM",
      "tripdetails": "Wheelchair needed"
    }
  }'
```

## 📊 Expected Result

After successful setup, your Google Sheets will automatically populate with:

| Timestamp | Call ID | Agent Name | Duration | Cost | Sentiment | Successful | Call Summary | First Name | Last Name | Email | Description | Facility Name | Doctor Name | Facility Number | Pickup Location | Drop Location | Appointment Date | Trip Details |
|-----------|---------|------------|----------|------|-----------|------------|--------------|------------|-----------|-------|-------------|---------------|-------------|-----------------|-----------------|---------------|------------------|--------------|
| 2024-10-07 15:30 | test-123 | Test Agent | 30000 | 1.50 | Positive | true | Test call summary | John | Smith | john@test.com | Medical appointment | Test Hospital | Dr. Johnson | Room 101 | 123 Main St | Test Hospital | Monday 2PM | Wheelchair needed |

## 🔧 Troubleshooting

### Issue: "Permission denied"
- Make sure Google Apps Script is set to execute as "Me"
- Ensure access is set to "Anyone"

### Issue: "Spreadsheet not found"
- Verify the spreadsheet ID in the script matches your sheet
- Make sure you have edit access to the spreadsheet

### Issue: "GOOGLE_SHEETS_URL not set"
- Add the environment variable to Vercel
- Redeploy after adding the variable

## 🎯 Final Configuration

### Retell AI Webhook Setup
Once everything is working, configure Retell AI to send webhooks to:
**URL:** `https://amera-m3jodk3pc-mahees-projects-2df6704a.vercel.app/api/sheets`

### Monitoring
- **Vercel Logs:** `vercel logs https://amera-m3jodk3pc-mahees-projects-2df6704a.vercel.app`
- **Google Apps Script Logs:** script.google.com → Your project → Executions
- **Google Sheets:** Check for new rows appearing automatically

Your integration is ready! 🚀