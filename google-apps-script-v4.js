/**
 * Google Apps Script for Plumbing/HVAC Call Data Integration (v4)
 * 
 * This script receives call analysis data from Retell AI via webhook
 * and stores it in a Google Sheets spreadsheet.
 * 
 * Spreadsheet: https://docs.google.com/spreadsheets/d/1cbdvP5c-6QgZYsaXvVeTOD4VlYPKBV_yccY-lI8UFa0/edit?usp=sharing
 * 
 * Deploy as Web App:
 * 1. Save this script in Google Apps Script
 * 2. Deploy > New Deployment
 * 3. Type: Web app
 * 4. Execute as: Me
 * 5. Who has access: Anyone
 * 6. Copy the Web App URL and use it as GOOGLE_SHEETS_URL_3 environment variable
 */

// Configuration
const SPREADSHEET_ID = '1cbdvP5c-6QgZYsaXvVeTOD4VlYPKBV_yccY-lI8UFa0';
const SHEET_NAME = 'Call Data'; // Change this to your sheet name if different

/**
 * Main function to handle POST requests from the webhook
 */
function doPost(e) {
  try {
    console.log('Received webhook request');
    
    // Parse the JSON payload
    const data = JSON.parse(e.postData.contents);
    console.log('Parsed data:', JSON.stringify(data, null, 2));
    
    // Open the spreadsheet
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = spreadsheet.getSheetByName(SHEET_NAME);
    
    // Create sheet if it doesn't exist
    if (!sheet) {
      sheet = spreadsheet.insertSheet(SHEET_NAME);
      // Add headers
      const headers = [
        'Timestamp',
        'Call ID',
        'Agent Name',
        'Duration (ms)',
        'User Sentiment',
        'Call Successful',
        'Call Summary',
        'From Number',
        'Customer Name',
        'Service Address',
        'Email',
        'Phone',
        'Is Emergency',
        'Emergency Type',
        'Transcript',
        'make_call',
        'response_call_id_1',
        'response_call_id_2',
        'response_call_id_3',
        'call_decline_counter'
      ];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      
      // Format header row
      const headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setBackground('#4285f4');
      headerRange.setFontColor('white');
      headerRange.setFontWeight('bold');
      headerRange.setWrap(true);
      
      // Set column widths
      sheet.setColumnWidth(1, 150);  // Timestamp
      sheet.setColumnWidth(2, 200);  // Call ID
      sheet.setColumnWidth(3, 120);  // Agent Name
      sheet.setColumnWidth(4, 100);  // Duration
      sheet.setColumnWidth(5, 120);  // Sentiment
      sheet.setColumnWidth(6, 100);  // Call Successful
      sheet.setColumnWidth(7, 300);  // Call Summary
      sheet.setColumnWidth(8, 120);  // From Number
      sheet.setColumnWidth(9, 150);  // Customer Name
      sheet.setColumnWidth(10, 200); // Service Address
      sheet.setColumnWidth(11, 200); // Email
      sheet.setColumnWidth(12, 120); // Phone
      sheet.setColumnWidth(13, 100); // Is Emergency
      sheet.setColumnWidth(14, 120); // Emergency Type
      sheet.setColumnWidth(15, 400); // Transcript
    }
    
    // Prepare the row data
    const rowData = [
      data.timestamp || new Date().toISOString(),
      data.call_id || '',
      data.agent_name || '',
      data.call_duration || 0,
      data.user_sentiment || '',
      data.call_successful || false,
      data.call_summary || '',
      data.fromNumber || '',
      data.customerName || '',
      data.serviceAddress || '',
      data.email || '',
      data.phone || '',
      data.isitEmergency || '',
      data.emergencyType || '',
      data.transcript || ''
    ];
    
    // Add the data to the sheet
    const lastRow = sheet.getLastRow();
    const newRow = lastRow + 1;
    sheet.getRange(newRow, 1, 1, rowData.length).setValues([rowData]);
    
    // Automatically set make_call = true and call_decline_counter = 0 for new rows
    sheet.getRange(newRow, 16).setValue(true);  // Column P (make_call)
    sheet.getRange(newRow, 20).setValue(0);     // Column T (call_decline_counter)
    
    // Format the new row
    const newRowRange = sheet.getRange(newRow, 1, 1, rowData.length);
    newRowRange.setWrap(true);
    newRowRange.setVerticalAlignment('top');
    
    // Alternate row colors for better readability
    if (newRow % 2 === 0) {
      newRowRange.setBackground('#f8f9fa');
    }
    
    // Format specific columns
    // Timestamp column
    sheet.getRange(newRow, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
    
    // Duration column (convert ms to seconds)
    const durationCell = sheet.getRange(newRow, 4);
    if (data.call_duration) {
      durationCell.setValue(data.call_duration / 1000);
      durationCell.setNumberFormat('0.0"s"');
    }
    
    // Call Successful column (boolean formatting)
    const successCell = sheet.getRange(newRow, 6);
    if (data.call_successful === true) {
      successCell.setBackground('#d4edda');
      successCell.setFontColor('#155724');
    } else if (data.call_successful === false) {
      successCell.setBackground('#f8d7da');
      successCell.setFontColor('#721c24');
    }
    
    // Emergency Type column (color coding)
    const emergencyTypeCell = sheet.getRange(newRow, 14);
    const emergencyType = data.emergencyType || '';
    if (emergencyType.toLowerCase().includes('plumbing')) {
      emergencyTypeCell.setBackground('#cce5ff');
      emergencyTypeCell.setFontColor('#0066cc');
    } else if (emergencyType.toLowerCase().includes('hvac')) {
      emergencyTypeCell.setBackground('#ffe5cc');
      emergencyTypeCell.setFontColor('#cc6600');
    }
    
    // Auto-resize columns if needed
    sheet.autoResizeColumns(1, rowData.length);
    
    console.log(`Successfully added data to row ${newRow}`);
    
    // Return success response
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Data added to Google Sheets',
        row: newRow,
        timestamp: new Date().toISOString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error('Error processing webhook:', error);
    
    // Return error response
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'error',
        message: error.toString(),
        timestamp: new Date().toISOString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle GET requests (for testing)
 */
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({
      status: 'ok',
      message: 'Plumbing/HVAC Call Data Integration (v4) is running',
      timestamp: new Date().toISOString(),
      spreadsheet_id: SPREADSHEET_ID,
      sheet_name: SHEET_NAME
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Test function to verify the setup
 */
function testWebhook() {
  const testData = {
    timestamp: new Date().toISOString(),
    call_id: 'test_call_123',
    agent_name: 'Test Agent',
    call_duration: 45000,
    user_sentiment: 'positive',
    call_successful: true,
    call_summary: 'Test call summary for plumbing emergency',
    fromNumber: '+1XXXXXXXXXX',
    customerName: 'John Doe',
    serviceAddress: '123 Main St, Anytown, USA',
    email: 'tech@plumbingcompany.com',
    phone: '+1XXXXXXXXXX',
    isitEmergency: 'Yes',
    emergencyType: 'Plumbing',
    transcript: 'This is a test transcript for the plumbing emergency call.'
  };
  
  const mockEvent = {
    postData: {
      contents: JSON.stringify(testData)
    }
  };
  
  const result = doPost(mockEvent);
  console.log('Test result:', result.getContent());
}

/**
 * Function to set up the spreadsheet with proper formatting
 */
function setupSpreadsheet() {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = spreadsheet.getSheetByName(SHEET_NAME);
    
    if (!sheet) {
      sheet = spreadsheet.insertSheet(SHEET_NAME);
    }
    
    // Clear existing content
    sheet.clear();
    
    // Add headers
    const headers = [
      'Timestamp',
      'Call ID',
      'Agent Name',
      'Duration (ms)',
      'User Sentiment',
      'Call Successful',
      'Call Summary',
      'From Number',
      'Customer Name',
      'Service Address',
      'Email',
      'Phone',
      'Is Emergency',
      'Emergency Type',
      'Transcript',
      'make_call',
      'response_call_id_1',
      'response_call_id_2',
      'response_call_id_3',
      'call_decline_counter'
    ];
    
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    // Format header row
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#4285f4');
    headerRange.setFontColor('white');
    headerRange.setFontWeight('bold');
    headerRange.setWrap(true);
    headerRange.setVerticalAlignment('middle');
    
    // Set column widths
    sheet.setColumnWidth(1, 150);  // Timestamp
    sheet.setColumnWidth(2, 200);  // Call ID
    sheet.setColumnWidth(3, 120);  // Agent Name
    sheet.setColumnWidth(4, 100);  // Duration
    sheet.setColumnWidth(5, 120);  // Sentiment
    sheet.setColumnWidth(6, 100);  // Call Successful
    sheet.setColumnWidth(7, 300);  // Call Summary
    sheet.setColumnWidth(8, 120);  // From Number
    sheet.setColumnWidth(9, 150);  // Customer Name
    sheet.setColumnWidth(10, 200); // Service Address
    sheet.setColumnWidth(11, 200); // Email
    sheet.setColumnWidth(12, 120); // Phone
    sheet.setColumnWidth(13, 100); // Is Emergency
    sheet.setColumnWidth(14, 120); // Emergency Type
    sheet.setColumnWidth(15, 400); // Transcript
    
    // Freeze header row
    sheet.setFrozenRows(1);
    
    console.log('Spreadsheet setup completed successfully');
    
  } catch (error) {
    console.error('Error setting up spreadsheet:', error);
  }
}