/**
 * Google Apps Script for receiving webhook data and writing to Google Sheets v3 (EliteFire)
 * 
 * Setup Instructions:
 * 1. Go to https://script.google.com/
 * 2. Create a new project
 * 3. Replace the default code with this script
 * 4. Deploy as a Web App (Execute as: Me, Access: Anyone)
 * 5. Copy the Web App URL and set it as GOOGLE_SHEETS_URL_3 environment variable
 */

function doPost(e) {
    try {
        // Parse the incoming JSON data
        const data = JSON.parse(e.postData.contents);

        // Get or create the spreadsheet
        const spreadsheetId = '1alceRJN8miM60fx88UIoYqipN_W6cH8gXRrENrhKXtM'; // Your third Google Sheets ID
        const sheet = SpreadsheetApp.openById(spreadsheetId).getActiveSheet();

        // Set up headers if this is the first row
        if (sheet.getLastRow() === 0) {
            const headers = [
                'Timestamp',
                'Call ID',
                'Agent Name',
                'Duration (ms)',
                'Cost ($)',
                'Sentiment',
                'Successful',
                'Call Summary',
                'From Number',
                'Customer Name',
                'Service Address',
                'Call Summary (Extracted)',
                'Email',
                'Recording URL'
            ];
            sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

            // Format headers
            sheet.getRange(1, 1, 1, headers.length)
                .setFontWeight('bold')
                .setBackground('#4285f4')
                .setFontColor('white');
        }

        // Prepare row data
        const rowData = [
            new Date(data.timestamp),
            data.call_id || '',
            data.agent_name || '',
            data.call_duration || 0,
            data.call_cost || 0,
            data.user_sentiment || '',
            data.call_successful || false,
            data.call_summary || '',
            data.fromNumber || '',
            data.customerName || '',
            data.serviceAddress || '',
            data.callSummary || '',
            data.email || '',
            data.recording_url || ''
        ];

        // Insert the row at position 2 (after headers) to keep most recent calls at the top
        if (sheet.getLastRow() > 0) {
            sheet.insertRowAfter(1);
            sheet.getRange(2, 1, 1, rowData.length).setValues([rowData]);
        } else {
            sheet.appendRow(rowData);
        }

        // Auto-resize columns for better readability
        sheet.autoResizeColumns(1, rowData.length);

        // Return success response
        return ContentService
            .createTextOutput(JSON.stringify({
                status: 'success',
                message: 'Data added to Google Sheets v3 (EliteFire)',
                row: sheet.getLastRow()
            }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
        // Return error response
        return ContentService
            .createTextOutput(JSON.stringify({
                status: 'error',
                message: error.toString()
            }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

function doGet(_e) {
    // Handle GET requests (for testing)
    return ContentService
        .createTextOutput(JSON.stringify({
            status: 'success',
            message: 'Google Apps Script v3 (EliteFire) is running',
            timestamp: new Date().toISOString()
        }))
        .setMimeType(ContentService.MimeType.JSON);
}