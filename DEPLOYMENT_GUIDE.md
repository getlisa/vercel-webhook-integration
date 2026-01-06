# Vercel Webhook Deployment Guide

## Prerequisites

- [Vercel Account](https://vercel.com) (free tier sufficient)
- [Vercel CLI](https://vercel.com/cli) installed
- Google account for Google Sheets integration
- Retell AI account and agent configured

## Quick Deployment

### 1. Clone and Setup

```bash
# Navigate to project directory
cd vercel-webhook

# Install Vercel CLI (if not installed)
npm i -g vercel

# Login to Vercel
vercel login
```

### 2. Deploy to Vercel

```bash
# Deploy to production
vercel --prod

# Follow prompts:
# - Set up and deploy? Yes
# - Which scope? (select your account)
# - Link to existing project? No
# - Project name? vercel-webhook (or your choice)
# - Directory? ./
# - Override settings? No
```

### 3. Get Deployment URL

After deployment, you'll receive URLs like:
```
Fire Safety: https://vercel-webhook-abc123.vercel.app/api/sheets2
Plumbing/HVAC: https://vercel-webhook-abc123.vercel.app/api/sheets3
```

## Google Sheets Configuration

### 1. Create Google Spreadsheets

#### For Fire Safety Integration
1. Create a new Google Spreadsheet
2. Name it "Fire Safety Call Data" (or your preference)
3. Note the Spreadsheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
   ```

#### For Plumbing/HVAC Integration
1. Create another Google Spreadsheet
2. Name it "Plumbing HVAC Call Data" (or your preference)
3. Note the Spreadsheet ID from the URL

### 2. Set Up Google Apps Scripts

#### Fire Safety Script (sheets2)
1. Go to [Google Apps Script](https://script.google.com/)
2. Click "New Project"
3. Replace default code with content from `google-apps-script-v3.js`
4. Update the `SPREADSHEET_ID` constant with your fire safety spreadsheet ID
5. Save the project (name it "Fire Safety Webhook Handler")

#### Plumbing/HVAC Script (sheets3)
1. Create another new project in Google Apps Script
2. Replace default code with content from `google-apps-script-v4.js`
3. Update the `SPREADSHEET_ID` constant with your plumbing/HVAC spreadsheet ID
4. Save the project (name it "Plumbing HVAC Webhook Handler")

### 3. Deploy Google Apps Scripts as Web Apps

#### For Both Scripts:
1. Click "Deploy" → "New deployment"
2. Choose type: "Web app"
3. Configuration:
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click "Deploy"
5. **Important**: Copy the Web App URL (ends with `/exec`)
6. Authorize the script when prompted

### 4. Add Environment Variables to Vercel

#### Option A: Via Vercel Dashboard
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project
3. Go to Settings → Environment Variables
4. Add these variables:
   - `GOOGLE_SHEETS_URL_2` = Fire safety Web App URL
   - `GOOGLE_SHEETS_URL_3` = Plumbing/HVAC Web App URL
   - `FALLBACK_TECH_EMAIL` = fallback@company.com (optional)
   - `FALLBACK_TECH_PHONE` = +1234567890 (optional)
5. Click "Save"
6. Redeploy: `vercel --prod`

#### Option B: Via CLI
```bash
# Add fire safety Google Sheets URL
vercel env add GOOGLE_SHEETS_URL_2
# Enter: https://script.google.com/macros/s/.../exec

# Add plumbing/HVAC Google Sheets URL
vercel env add GOOGLE_SHEETS_URL_3
# Enter: https://script.google.com/macros/s/.../exec

# Add fallback technician data (optional)
vercel env add FALLBACK_TECH_EMAIL
# Enter: fallback@company.com

vercel env add FALLBACK_TECH_PHONE
# Enter: +1234567890

# Redeploy to apply changes
vercel --prod
```

## Testing Deployment

### 1. Health Check Tests

```bash
# Test fire safety endpoint
curl https://your-deployment.vercel.app/api/sheets2

# Expected response:
{
  "message": "Google Sheets Integration API v2",
  "status": "healthy",
  "variables": ["fromNumber", "customerName", "serviceAddress", "callSummary", "email"],
  "endpoints": {
    "POST /": "Process call analysis data and send to Google Sheets v2"
  }
}

# Test plumbing/HVAC endpoint
curl https://your-deployment.vercel.app/api/sheets3

# Expected response:
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

### 2. Google Apps Script Tests

Test each Google Apps Script directly:

```bash
# Test fire safety script
curl "https://script.google.com/macros/s/YOUR_FIRE_SAFETY_SCRIPT_ID/exec"

# Test plumbing/HVAC script
curl "https://script.google.com/macros/s/YOUR_PLUMBING_HVAC_SCRIPT_ID/exec"
```

Both should return JSON responses indicating they're running.

### 3. End-to-End Integration Tests

Create test files:

**fire_safety_test.json:**
```json
{
  "event": "call_analyzed",
  "call": {
    "call_id": "test_fire_123",
    "agent_name": "Fire Safety Agent",
    "duration_ms": 45000,
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
    "transcript": "Customer called about fire alarm system maintenance..."
  }
}
```

**plumbing_hvac_test.json:**
```json
{
  "event": "call_analyzed",
  "call": {
    "call_id": "test_plumbing_123",
    "agent_name": "Plumbing Agent",
    "duration_ms": 60000,
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

Run tests:
```bash
# Test fire safety integration
curl -X POST https://your-deployment.vercel.app/api/sheets2 \
  -H "Content-Type: application/json" \
  -d @fire_safety_test.json

# Test plumbing/HVAC integration
curl -X POST https://your-deployment.vercel.app/api/sheets3 \
  -H "Content-Type: application/json" \
  -d @plumbing_hvac_test.json
```

Check your Google Sheets - you should see new rows with the test data.

## Retell AI Configuration

### Fire Safety Agent Setup

1. Go to your Retell AI dashboard
2. Select your fire safety agent
3. Configure webhook:
   - **URL**: `https://your-deployment.vercel.app/api/sheets2`
   - **Events**: `call_analyzed`
4. Configure dynamic variables:
   ```json
   [
     {
       "name": "fromNumber",
       "type": "string",
       "description": "Caller's phone number"
     },
     {
       "name": "customerName",
       "type": "string",
       "description": "Customer's name"
     },
     {
       "name": "serviceAddress",
       "type": "string",
       "description": "Service location address"
     },
     {
       "name": "emergencyType",
       "type": "string",
       "description": "Type of emergency: Fire Alarm or Sprinkler"
     },
     {
       "name": "isitEmergency",
       "type": "string",
       "description": "Whether this is an emergency: Yes or No"
     }
   ]
   ```

### Plumbing/HVAC Agent Setup

1. Select your plumbing/HVAC agent
2. Configure webhook:
   - **URL**: `https://your-deployment.vercel.app/api/sheets3`
   - **Events**: `call_analyzed`
3. Configure dynamic variables:
   ```json
   [
     {
       "name": "fromNumber",
       "type": "string",
       "description": "Caller's phone number"
     },
     {
       "name": "customerName",
       "type": "string",
       "description": "Customer's name"
     },
     {
       "name": "serviceAddress",
       "type": "string",
       "description": "Service location address"
     },
     {
       "name": "emergencyType",
       "type": "string",
       "description": "Type of emergency: Plumbing or HVAC"
     },
     {
       "name": "isitEmergency",
       "type": "string",
       "description": "Whether this is an emergency: Yes or No"
     }
   ]
   ```

## Monitoring & Maintenance

### View Logs

```bash
# View all logs
vercel logs https://your-deployment.vercel.app

# View recent logs
vercel logs https://your-deployment.vercel.app --since=1h

# Filter by endpoint
vercel logs https://your-deployment.vercel.app | grep SHEETS2
vercel logs https://your-deployment.vercel.app | grep SHEETS3

# Filter errors only
vercel logs https://your-deployment.vercel.app | grep ERROR
```

### Google Apps Script Logs

1. Go to [Google Apps Script](https://script.google.com/)
2. Open your project
3. Click "Executions" tab to view execution logs
4. Check for any errors or failed executions

### Update Deployment

```bash
# Make code changes, then redeploy
vercel --prod

# Or use automatic deployments via Git integration
```

### Environment Variable Updates

```bash
# Update existing variable
vercel env rm GOOGLE_SHEETS_URL_2
vercel env add GOOGLE_SHEETS_URL_2
# Enter new URL

# Redeploy to apply changes
vercel --prod
```

## Advanced Configuration

### Custom Domain

1. Go to Vercel Dashboard → Project → Settings → Domains
2. Add your custom domain
3. Update Retell AI webhook URLs to use custom domain

### Multiple Environments

```bash
# Deploy to preview (staging)
vercel

# Deploy to production
vercel --prod

# Set environment-specific variables
vercel env add GOOGLE_SHEETS_URL_2 preview
vercel env add GOOGLE_SHEETS_URL_2 production
```

### Git Integration

1. Connect your Vercel project to GitHub/GitLab
2. Enable automatic deployments
3. Set up branch-based deployments:
   - `main` branch → Production
   - `develop` branch → Preview

## Troubleshooting Deployment

### Common Issues

**Deployment Fails:**
```bash
# Check build logs
vercel logs https://your-deployment.vercel.app --since=10m

# Common fixes:
# 1. Verify vercel.json syntax
# 2. Check Python version compatibility
# 3. Ensure no syntax errors in Python files
```

**Environment Variables Not Working:**
```bash
# Verify variables are set
vercel env ls

# Check variable names match exactly
# Redeploy after adding variables
vercel --prod
```

**Google Sheets Not Updating:**
```bash
# Verify Google Apps Script Web App URLs
# Check Google Apps Script execution logs
# Test Web App URLs directly with curl

# Ensure Google Apps Script permissions are correct:
# - Execute as: Me
# - Who has access: Anyone
```

**External API Failures:**
```bash
# Check if external APIs are accessible
curl https://fire-alarm-men6qqx0l-mahees-projects-2df6704a.vercel.app/api/assignments
curl https://sprinkler-p52oxcmyy-mahees-projects-2df6704a.vercel.app/api/assignments
curl https://plumbing-api.vercel.app/api/assignments
curl https://hvacapi.vercel.app/api/assignments

# If APIs are down, fallback environment variables will be used
```

**Webhook Not Receiving Requests:**
```bash
# Verify webhook URL in Retell AI
# Check Vercel function logs
vercel logs https://your-deployment.vercel.app --since=1h

# Test webhook directly
curl -X POST https://your-deployment.vercel.app/api/sheets2 \
  -H "Content-Type: application/json" \
  -d '{"event":"test"}'
```

### Performance Optimization

**Function Timeout:**
- Default: 10 seconds (Hobby plan)
- Upgrade to Pro for 60 seconds if needed
- Optimize external API calls for faster response

**Cold Starts:**
- First request may be slower
- Consider using Vercel Pro for better performance
- Implement health check monitoring

**Memory Usage:**
- Default: 1024 MB
- Monitor usage in Vercel dashboard
- Optimize if approaching limits

## Security Best Practices

### Environment Variables
- Never commit credentials to Git
- Use Vercel's encrypted environment variables
- Rotate Google Apps Script deployments periodically

### API Security
- Webhook endpoints are public but validate Retell AI payloads
- Google Apps Script Web Apps use Google's authentication
- Monitor for unusual activity in logs

### Access Control
- Limit Vercel project access to necessary team members
- Use Vercel teams for organization-level access control
- Enable two-factor authentication

## Backup & Recovery

### Configuration Backup
```bash
# Export environment variables
vercel env pull .env.backup

# Backup vercel.json and source code in Git
git add .
git commit -m "Backup deployment configuration"
git push
```

### Google Sheets Backup
- Export Google Sheets as Excel/CSV regularly
- Keep copies of Google Apps Script code
- Document Spreadsheet IDs and Web App URLs

### Disaster Recovery
1. Redeploy from Git repository
2. Restore environment variables from backup
3. Recreate Google Apps Script Web Apps if needed
4. Update Retell AI webhook URLs if domain changed
5. Test functionality with health checks

## Support & Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel CLI Reference](https://vercel.com/docs/cli)
- [Google Apps Script Documentation](https://developers.google.com/apps-script)
- [Google Sheets API Documentation](https://developers.google.com/sheets/api)
- [Retell AI Webhook Documentation](https://docs.retellai.com/webhooks)

For issues specific to this webhook implementation, check the logs and refer to the troubleshooting sections in the main README.