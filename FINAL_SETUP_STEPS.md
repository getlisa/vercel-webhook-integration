# 🎯 Final Setup Steps

## ✅ What's Already Done

1. **Vercel API Endpoint:** `https://amera-m3jodk3pc-mahees-projects-2df6704a.vercel.app/api/sheets`
2. **Google Sheets ID:** `14AOSf9cS_J_JnWbxT3_wg_wRUeOSMaCvFRE1iEhoGMU`
3. **Google Apps Script:** Ready to deploy (configured for your spreadsheet)
4. **Variable Extraction:** Simplified to use Retell's pre-extracted variables

## 🚀 What You Need to Do (5 minutes)

### Step 1: Deploy Google Apps Script

1. **Go to:** https://script.google.com/
2. **Click:** "New Project"
3. **Copy & Paste:** The entire content from `google-apps-script.js`
4. **Save:** Press Ctrl+S, name it "Retell Webhook Handler"
5. **Deploy:** 
   - Click "Deploy" → "New deployment"
   - Type: "Web app"
   - Execute as: "Me"
   - Access: "Anyone"
   - Click "Deploy"
6. **Copy the Web App URL** (starts with `https://script.google.com/macros/s/...`)

### Step 2: Add URL to Vercel

```bash
vercel env add GOOGLE_SHEETS_URL
# Paste your Web App URL when prompted
```

### Step 3: Redeploy Vercel

```bash
vercel --prod
```

### Step 4: Test Integration

```bash
./test_sheets_integration.sh
```

## 📊 Expected Result

After setup, your Google Sheets will automatically populate with call data:

**Your Spreadsheet:** https://docs.google.com/spreadsheets/d/14AOSf9cS_J_JnWbxT3_wg_wRUeOSMaCvFRE1iEhoGMU/edit

**Columns:**
- Timestamp, Call ID, Agent Name, Duration, Cost, Sentiment, Successful
- Call Summary, First Name, Last Name, Email, Description
- Facility Name, Doctor Name, Facility Number
- Pickup Location, Drop Location, Appointment Date, Trip Details

**Most recent calls will appear at the top!**

## 🔗 Webhook Configuration

Once working, configure Retell AI to send webhooks to:
```
https://amera-m3jodk3pc-mahees-projects-2df6704a.vercel.app/api/sheets
```

## 🎉 You're Almost Done!

The integration is 95% complete. Just need to:
1. Deploy the Google Apps Script (2 minutes)
2. Add the Web App URL to Vercel (1 minute)
3. Test it (30 seconds)

Your call data will then automatically flow into Google Sheets! 🚀