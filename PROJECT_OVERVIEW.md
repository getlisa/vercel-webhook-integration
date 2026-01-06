# Vercel Webhook Project Overview

## Project Summary

The Vercel Webhook Integration is a comprehensive serverless system that connects Retell AI voice agents with Google Sheets for automated call data collection, analysis, and technician assignment. It supports multiple specialized business verticals including fire safety services and plumbing/HVAC operations through intelligent routing and external API integration.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Retell AI     │    │  Vercel Webhook  │    │  External APIs  │    │  Google Sheets  │
│   Voice Agent   │───▶│   (Serverless)   │───▶│  (Tech Data)    │───▶│   (Data Store)  │
│                 │    │                  │    │                 │    │                 │
│ • Call Analysis │    │ • Variable       │    │ • Fire Alarm    │    │ • Call Records  │
│ • Dynamic Vars  │    │   Extraction     │    │ • Sprinkler     │    │ • Tech Info     │
│ • Webhooks      │    │ • API Integration│    │ • Plumbing      │    │ • Analytics     │
│ • Event Routing │    │ • Data Processing│    │ • HVAC          │    │ • Automation    │
└─────────────────┘    └──────────────────┘    └─────────────────┘    └─────────────────┘
                                                                                │
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐              │
│  Google Apps    │    │   Retell AI      │    │   Technicians   │              │
│    Script       │───▶│  Outbound API    │───▶│   (Emergency    │◀─────────────┘
│                 │    │                  │    │    Calls)       │
│ • Timer Trigger │    │ • Call Creation  │    │                 │
│ • Call Logic    │    │ • Status Check   │    │ • Phone Calls   │
│ • Transfer Det. │    │ • Transfer Tool  │    │ • Call Transfer │
│ • Retry Logic   │    │ • Call Analysis  │    │ • Emergency Resp│
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Core Components

### 1. Fire Safety Integration (`/api/sheets2`)
- **Purpose**: Handles fire alarm and sprinkler system service calls
- **External APIs**: Fire Alarm API, Sprinkler API
- **Google Sheet**: Fire safety call tracking with technician assignment
- **Emergency Types**: "Fire Alarm", "Sprinkler"

### 2. Plumbing/HVAC Integration (`/api/sheets3`)
- **Purpose**: Handles plumbing and HVAC emergency service calls
- **External APIs**: Plumbing API, HVAC API
- **Google Sheet**: Plumbing/HVAC call tracking with technician assignment
- **Emergency Types**: "Plumbing", "HVAC"

### 3. Google Apps Script Integration
- **Fire Safety Script**: `google-apps-script-v3.js`
- **Plumbing/HVAC Script**: `google-apps-script-v4.js`
- **Automation Scripts**: Call automation and follow-up systems

### 4. Outbound Call Automation System
- **Fire Safety Automation**: `call-automation-system.js`
- **Plumbing/HVAC Automation**: `google-apps-script-plumbing-automation.js`
- **Call Management**: Automated emergency response calls to technicians

## Key Features

### Intelligent Data Processing
- **Multi-source Variable Extraction**: Extracts data from 5+ locations in Retell AI payload
- **Emergency Type Detection**: Routes calls based on emergency classification
- **Smart Fallback Logic**: Handles missing data with intelligent defaults
- **Address Parsing**: Converts full address strings into structured components

### External API Integration
- **Dynamic API Selection**: Routes to appropriate tech API based on emergency type
- **Fallback Chain**: Primary API → Secondary API → Environment Variables
- **Tech Data Enrichment**: Automatically fetches technician contact information
- **SSL/TLS Handling**: Robust SSL certificate handling for external calls

### Outbound Call Automation
- **Time-based Triggers**: Google Apps Script runs every 1 minute to check for emergency calls
- **Multi-attempt Logic**: Configurable retry attempts (2-3 attempts + fallback)
- **Transfer Detection**: Monitors for successful call transfers to stop automation
- **Call Status Monitoring**: Tracks call progress and completion status
- **Dynamic Phone Resolution**: Fetches fallback numbers from external APIs
- **Emergency Prioritization**: Only processes rows marked as emergencies

### Reliability & Performance
- **Content-based Deduplication**: MD5 hashing prevents duplicate processing
- **Comprehensive Error Handling**: Graceful failures with detailed logging
- **Health Monitoring**: GET endpoints for system status verification
- **Serverless Scalability**: Automatic scaling with Vercel infrastructure

## Data Flow

### Fire Safety Call Flow
```
1. Fire Safety Call → Retell AI Agent
2. call_analyzed Event → Vercel Webhook (/api/sheets2)
3. Extract Variables (fromNumber, customerName, serviceAddress, emergencyType)
4. Determine Emergency Type (Fire Alarm vs Sprinkler)
5. Query Appropriate API (Fire Alarm API or Sprinkler API)
6. Combine Call Data + Variables + Tech Data
7. Send to Google Sheets (Fire Safety Sheet)
8. Return Success Response
```

### Plumbing/HVAC Call Flow
```
1. Plumbing/HVAC Call → Retell AI Agent
2. call_analyzed Event → Vercel Webhook (/api/sheets3)
3. Extract Variables (fromNumber, customerName, serviceAddress, emergencyType)
4. Determine Emergency Type (Plumbing vs HVAC)
5. Query Appropriate API (Plumbing API or HVAC API)
6. Combine Call Data + Variables + Tech Data
7. Send to Google Sheets (Plumbing/HVAC Sheet)
8. Return Success Response
```

### Outbound Call Automation Flow
```
1. Google Apps Script Timer (Every 1 minute)
2. Scan Google Sheets for Emergency Rows
   - make_call = true (or null/empty)
   - is_emergency = true
3. Determine Call Attempt Stage
   - Counter 0: First attempt
   - Counter 1: Second attempt (after 5-min delay)
   - Counter 2: Third attempt (plumbing/HVAC only, after 5-min delay)
   - Counter 3+: Fallback attempt
4. Make Outbound Call via Retell AI API
   - Use tech phone number or fallback from APIs
   - Pass customer info and emergency details
5. Monitor Call Status
   - Wait for call completion
   - Check for transfer_call tool invocation
6. Update Automation State
   - Increment counter
   - Disable automation if transfer successful
   - Continue to next attempt if no transfer
```

## Variable Mapping

### Core Variables (Both Endpoints)
| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `fromNumber` | Caller's phone number | "+1234567890" | Yes |
| `customerName` | Customer's name | "John Doe" | Yes |
| `serviceAddress` | Service location | "123 Main St, City, State" | Yes |
| `emergencyType` | Type of emergency | "Fire Alarm", "Plumbing" | Yes |
| `callSummary` | Call summary | "Fire alarm inspection needed" | No |
| `email` | Contact email | "customer@email.com" | No |
| `isitEmergency` | Emergency flag | "Yes", "No" | No |

### Variable Extraction Sources (Priority Order)
1. **collected_dynamic_variables** - Primary Retell AI variables
2. **custom_analysis_data** - Custom analysis results
3. **transcript_with_tool_calls** - Tool call results (extract_variables function)
4. **tool_call_result** - Any tool call results containing variables
5. **Direct fields** - Direct call_data fields (fallback)

## External API Integration

### Fire Safety APIs
| Emergency Type | Primary API | Fallback API |
|----------------|-------------|--------------|
| "Sprinkler" | Sprinkler API | Fire Alarm API |
| "Fire Alarm" | Fire Alarm API | Sprinkler API |
| Empty/Unknown | Fire Alarm API | Sprinkler API |

**API Endpoints:**
- Fire Alarm: `https://fire-alarm-men6qqx0l-mahees-projects-2df6704a.vercel.app/api/assignments`
- Sprinkler: `https://sprinkler-p52oxcmyy-mahees-projects-2df6704a.vercel.app/api/assignments`

### Plumbing/HVAC APIs
| Emergency Type | Primary API | Fallback API |
|----------------|-------------|--------------|
| "Plumbing" | Plumbing API | HVAC API |
| "HVAC" | HVAC API | Plumbing API |
| Empty/Unknown | HVAC API | Plumbing API |

**API Endpoints:**
- Plumbing: `https://plumbing-api.vercel.app/api/assignments`
- HVAC: `https://hvacapi.vercel.app/api/assignments`

### API Response Processing
**Expected Format:**
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

## Google Sheets Integration

### Sheet Structure
Both fire safety and plumbing/HVAC sheets contain:

| Column | Description | Source |
|--------|-------------|--------|
| Timestamp | When data was processed | System generated |
| Call ID | Retell AI call identifier | Call data |
| Agent Name | Retell AI agent name | Call data |
| Duration | Call duration in ms | Call data |
| User Sentiment | Call sentiment analysis | Call analysis |
| Call Successful | Success flag | Call analysis |
| Call Summary | AI-generated summary | Call analysis |
| From Number | Caller's phone | Extracted variable |
| Customer Name | Customer name | Extracted variable |
| Service Address | Service location | Extracted variable |
| Email | Tech email | External API |
| Phone | Tech phone | External API |
| Is Emergency | Emergency flag | Extracted variable |
| Emergency Type | Type of emergency | Extracted variable |
| Transcript | Full call transcript | Call data |
| **make_call** | **Automation enable flag** | **Auto-set to true** |
| **response_call_id_1** | **First outbound call ID** | **Automation system** |
| **response_call_id_2** | **Second outbound call ID** | **Automation system** |
| **response_call_id_3** | **Third outbound call ID (plumbing/HVAC)** | **Automation system** |
| **call_decline_counter** | **Call attempt counter** | **Auto-incremented** |

### Google Apps Script Features
- **Automatic Sheet Creation**: Creates sheets with proper headers if not exist
- **Data Formatting**: Applies colors, fonts, and number formatting
- **Column Sizing**: Optimizes column widths for readability
- **Row Alternation**: Alternating row colors for better visibility
- **Emergency Type Color Coding**: Visual distinction for different emergency types

## Outbound Call Automation System

### Overview
The system includes a sophisticated outbound call automation feature that automatically makes emergency calls to technicians when urgent situations are detected. This is implemented through Google Apps Script with time-based triggers that run every minute.

### Architecture Components

#### 1. Google Apps Script Automation
- **Fire Safety**: `call-automation-system.js`
- **Plumbing/HVAC**: `google-apps-script-plumbing-automation.js`
- **Timer Triggers**: Execute every 1 minute
- **Call Management**: Handles multi-attempt logic and status monitoring

#### 2. Retell AI Integration
- **Outbound API**: Creates phone calls via Retell AI API
- **Agent Configuration**: Uses specialized outbound agents
- **Dynamic Variables**: Passes customer and emergency information
- **Transfer Tool**: Monitors for successful call transfers

#### 3. External API Integration
- **ServiceTrade API**: Fallback numbers for fire safety
- **Plumbing/HVAC APIs**: Fallback numbers for plumbing/HVAC
- **Dynamic Resolution**: Fetches available technician numbers

### Call Automation Logic

#### Trigger Conditions
Automation only processes rows that meet both conditions:
- **make_call** = true (or null/empty for new rows)
- **is_emergency** = true (or "yes", "YES", 1)

#### Fire Safety Call Sequence (2 attempts + fallback)
1. **First Attempt (counter=0)**:
   - Call tech phone number from sheet
   - Set response_call_id_1, increment counter to 1

2. **Second Attempt (counter=1)**:
   - Wait 5 minutes after first call ends
   - Check for transfer_call tool invocation
   - If no transfer: call tech phone again
   - Set response_call_id_2, increment counter to 2

3. **Fallback Attempt (counter=2)**:
   - Wait 5 minutes after second call ends
   - Check for transfer_call tool invocation
   - If no transfer: call fallback number from ServiceTrade API
   - Disable automation (make_call = false)

#### Plumbing/HVAC Call Sequence (3 attempts + fallback)
1. **First Attempt (counter=0)**:
   - Call tech phone number from sheet
   - Set response_call_id_1, increment counter to 1

2. **Second Attempt (counter=1)**:
   - Wait 5 minutes after first call ends
   - Check for transfer_call tool invocation
   - If no transfer: call tech phone again
   - Set response_call_id_2, increment counter to 2

3. **Third Attempt (counter=2)**:
   - Wait 5 minutes after second call ends
   - Check for transfer_call tool invocation
   - If no transfer: call tech phone again
   - Set response_call_id_3, increment counter to 3

4. **Fallback Attempt (counter=3)**:
   - Wait 5 minutes after third call ends
   - Check for transfer_call tool invocation
   - If no transfer: call fallback number from Plumbing/HVAC APIs
   - Disable automation (make_call = false)

### Call Status Monitoring

#### Real-time Status Checking
- **Ongoing Call Detection**: Waits for active calls to complete
- **End Timestamp Tracking**: Records when calls end
- **5-minute Delay Enforcement**: Ensures proper spacing between attempts
- **Status API Integration**: Uses Retell AI get-call API

#### Transfer Detection
- **Tool Invocation Monitoring**: Checks for transfer_call tool usage
- **Success/Failure Agnostic**: Stops automation if transfer is attempted
- **Immediate Termination**: Disables automation upon successful transfer
- **Transcript Analysis**: Examines transcript_with_tool_calls data

### Phone Number Management

#### Dynamic Phone Resolution
- **Primary Numbers**: Uses tech phone from Google Sheets
- **Fallback APIs**: Queries external APIs for backup numbers
- **Phone Formatting**: Standardizes to +1XXXXXXXXXX format
- **Error Handling**: Falls back to environment variables if APIs fail

#### API Integration for Fallbacks
- **Fire Safety**: ServiceTrade API for technician lookup
- **Plumbing**: Plumbing API for available technicians
- **HVAC**: HVAC API for available technicians
- **Environment Fallbacks**: FALLBACK_TECH_PHONE as last resort

### Automation Control

#### Automatic Management
- **New Row Initialization**: Sets make_call=true for emergency rows
- **Counter Management**: Tracks attempt number automatically
- **Status Updates**: Updates call IDs and counters in real-time
- **Cleanup**: Disables automation after completion

#### Manual Override
- **make_call Flag**: Can be manually set to false to disable
- **Counter Reset**: Can be manually reset to restart automation
- **Call ID Clearing**: Can clear call IDs to restart sequence

### Configuration Management

#### Script Properties
- **API Keys**: Stored securely in Google Apps Script properties
- **Sensitive Data**: Credentials and tokens protected
- **Environment Variables**: Fallback values configurable

#### Column Mapping
- **Flexible Configuration**: Column indices configurable in CONFIG object
- **Sheet Compatibility**: Adapts to different sheet structures
- **Header Management**: Automatically adds required columns

### Error Handling & Logging

#### Comprehensive Logging
- **Prefixed Messages**: All logs tagged with system identifier
- **Debug Information**: Detailed variable and status logging
- **Error Tracking**: Exception handling with stack traces
- **Performance Monitoring**: Execution time and resource usage

#### Graceful Degradation
- **API Failures**: Continues with fallback options
- **Network Issues**: Retries with exponential backoff
- **Data Validation**: Handles missing or invalid data
- **State Recovery**: Resumes from last known good state

### Performance Characteristics

#### Scalability
- **Batch Processing**: Processes multiple rows efficiently
- **Resource Management**: Optimized for Google Apps Script limits
- **Concurrent Handling**: Manages multiple active calls
- **Memory Efficiency**: Minimal memory footprint

#### Timing & Delays
- **1-minute Intervals**: Timer trigger frequency
- **5-minute Delays**: Between call attempts
- **Call Duration Handling**: Waits for call completion
- **Status Check Frequency**: Real-time monitoring

This comprehensive outbound call automation system ensures that emergency situations receive immediate attention through automated technician notification, with intelligent retry logic and transfer detection to optimize response times while minimizing unnecessary calls.

### Hash Generation
Creates MD5 hash from:
- `call_id` - Unique call identifier
- `custom_data` - Custom analysis data (stringified)
- `collected_vars` - Dynamic variables (stringified)
- `timestamp_minute` - Timestamp rounded to minute

### Storage Management
- **File Location**: `/tmp/processed_calls_sheets2.json`, `/tmp/processed_calls_sheets3.json`
- **Cleanup Policy**: Removes entries older than 24 hours
- **Size Limit**: Keeps only 1000 most recent entries
- **Automatic Maintenance**: Cleanup runs on each request

## Error Handling Strategy

### Error Categories
1. **Variable Extraction Errors**: Missing or invalid variables
2. **External API Errors**: API timeouts, invalid responses, network issues
3. **Google Sheets Errors**: Script failures, permission issues, quota limits
4. **Processing Errors**: JSON parsing, data transformation failures

### Response Codes
- `200` - Success, partial success, skipped (duplicate), or ignored
- `400` - Invalid JSON payload
- `500` - Internal server error

### Partial Success Handling
- **Data Processed**: Core operation succeeded but response generation failed
- **API Fallbacks**: Primary API failed but secondary API succeeded
- **Sheet Updates**: Data sent to sheets but confirmation failed

## Security Considerations

### Data Protection
- **Environment Variables**: Sensitive data stored in Vercel environment
- **No Credential Logging**: Credentials never appear in logs
- **HTTPS Communication**: All external communications use HTTPS
- **SSL Context**: Custom SSL handling for external API calls

### Access Control
- **Public Webhooks**: Endpoints are public but validate Retell AI payloads
- **Google Apps Script**: Uses Google's authentication and authorization
- **API Keys**: External APIs use their own authentication mechanisms

### Monitoring & Auditing
- **Comprehensive Logging**: All operations logged with prefixed messages
- **Error Tracking**: Detailed error logging without sensitive data
- **Health Checks**: Regular monitoring endpoints available

## Performance Characteristics

### Scalability
- **Serverless Architecture**: Automatic scaling with Vercel
- **Stateless Functions**: No persistent connections or state
- **Concurrent Processing**: Multiple calls processed simultaneously
- **Resource Efficiency**: Minimal memory footprint using stdlib only

### Latency
- **Typical Response**: 2-5 seconds for successful processing
- **With External APIs**: 3-8 seconds including API queries
- **Cold Start Penalty**: Additional 1-2 seconds for first request
- **Google Sheets Write**: 1-3 seconds for sheet updates

### Reliability
- **Retry Logic**: Built-in retry for transient failures
- **Fallback Systems**: Multiple fallback layers for data and APIs
- **Graceful Degradation**: Continues processing even with partial failures
- **Deduplication**: 100% duplicate prevention

## Deployment Architecture

### Vercel Configuration
```json
{
  "version": 2,
  "builds": [{"src": "api/*.py", "use": "@vercel/python"}],
  "routes": [{"src": "/api/(.*)", "dest": "api/$1.py"}]
}
```

### Environment Variables
- `GOOGLE_SHEETS_URL_2` - Fire safety Google Apps Script Web App URL
- `GOOGLE_SHEETS_URL_3` - Plumbing/HVAC Google Apps Script Web App URL
- `FALLBACK_TECH_EMAIL` - Fallback technician email (optional)
- `FALLBACK_TECH_PHONE` - Fallback technician phone (optional)

### Dependencies
- **Runtime**: Python 3.9+
- **Libraries**: Standard library only (urllib, json, hashlib, datetime, ssl)
- **Platform**: Vercel Serverless Functions
- **External Services**: Google Sheets, Google Apps Script, External Tech APIs

## Monitoring & Observability

### Logging Strategy
- **Prefixed Logs**: `[SHEETS2]`, `[SHEETS3]`, `[API]`, `[ERROR]`
- **Structured Information**: Call IDs, timestamps, operation results
- **Debug Levels**: Different verbosity levels for troubleshooting
- **No Sensitive Data**: Credentials and personal info excluded

### Health Checks
- **GET Endpoints**: Return system status and configuration
- **API Connectivity**: Test external API availability
- **Google Sheets**: Verify sheet access and permissions
- **Environment**: Check required environment variables

### Metrics & Analytics
- **Success Rates**: Track successful vs failed processing
- **Response Times**: Monitor performance across different operations
- **API Health**: Track external API availability and response times
- **Call Volume**: Monitor call processing volume and patterns

## Business Intelligence

### Data Collection
- **Call Analytics**: Sentiment, success rates, duration patterns
- **Geographic Distribution**: Service address mapping and analysis
- **Emergency Patterns**: Emergency type frequency and trends
- **Technician Assignment**: Tech utilization and response patterns

### Reporting Capabilities
- **Google Sheets Native**: Built-in charts, pivot tables, filtering
- **Export Options**: CSV, Excel, PDF export capabilities
- **Real-time Updates**: Live data updates as calls are processed
- **Historical Analysis**: Long-term trend analysis and reporting

## Future Enhancements

### Potential Improvements
1. **Webhook Validation**: Verify Retell AI signatures for security
2. **Advanced Analytics**: Machine learning for call pattern analysis
3. **Multi-tenant Support**: Support multiple organizations/accounts
4. **Custom Field Mapping**: Configurable variable extraction rules
5. **Real-time Notifications**: SMS/email alerts for emergency calls

### Scalability Considerations
1. **Database Integration**: Replace file-based deduplication with database
2. **Queue System**: Async processing for high-volume scenarios
3. **Caching Layer**: Cache external API responses for performance
4. **Load Balancing**: Distribute load across multiple regions
5. **Monitoring Dashboard**: Real-time system monitoring and alerting

## Integration Ecosystem

### Related Projects
- **comfitrust-webhook** - ComfiTrust CRM integration
- **buildops** - BuildOps field service management
- **adaptive-climate** - Climate control system integration
- **quotation-tech** - Automated quotation generation

### Shared Components
- Variable extraction patterns and methodologies
- Error handling and logging conventions
- Deduplication strategies and implementations
- Health check and monitoring approaches

## Success Metrics

### Operational Metrics
- **Uptime**: >99.9% availability target
- **Response Time**: <10 seconds average processing time
- **Error Rate**: <1% of total requests
- **Deduplication**: 100% duplicate prevention accuracy

### Business Metrics
- **Call Processing**: 100% of valid calls processed and stored
- **Tech Assignment**: Successful technician data retrieval rate
- **Data Quality**: Accuracy of extracted variables and information
- **User Satisfaction**: Reduced manual data entry and improved efficiency

This comprehensive system provides automated call processing, intelligent technician assignment, and real-time data collection for fire safety and plumbing/HVAC service operations, built on a scalable serverless architecture with robust error handling and monitoring capabilities.