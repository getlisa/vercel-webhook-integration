/**
 * Google Apps Script for Adaptive Climate Emergency Call Escalation System
 * 
 * ESCALATION FLOW:
 * 1. Call on-call technician (from API)
 * 2. If no response after 10 minutes, call on-call technician again
 * 3. If no response after 10 minutes, call John McLean (647 544-2606)
 * 4. If no response after 10 minutes, call Alex Kovachev (647 680-0669)
 * 5. If no response after 10 minutes, call John McLean (416 402-2601 & 647 544-2606)
 * 6. If no response after 10 minutes, call Brian Kerr (437 882-5186)
 * 7. If no response after 10 minutes, call John McLean (647 544-2606) continuously
 * 
 * If no on-call technician available, start from step 3 directly
 */

// Configuration
const CONFIG = {
  RETELL_API_KEY: 'key_f8b8b8b8b8b8b8b8b8b8b8b8b8b8b8b8', // Replace with actual Retell API key
  RETELL_AGENT_ID: 'agent_adaptive_climate_emergency', // Replace with actual agent ID
  DELAY_MINUTES: 10, // Delay between call attempts
  MAX_RETRIES: 3, // Maximum retries per phone number
  
  // Escalation contacts
  CONTACTS: {
    JOHN_MCLEAN_PRIMARY: '+16475442606',
    JOHN_MCLEAN_SECONDARY: '+14164022601', 
    ALEX_KOVACHEV: '+16476800669',
    BRIAN_KERR: '+14378825186'
  }
};

// Column mappings for the Google Sheet (0-based indices like other scripts)
const COLUMNS = {
  TIMESTAMP: 0,           // Column A
  CALL_ID: 1,            // Column B
  AGENT_NAME: 2,         // Column C
  CALL_DURATION: 3,      // Column D
  USER_SENTIMENT: 4,     // Column E
  CALL_SUCCESSFUL: 5,    // Column F
  CALL_SUMMARY: 6,       // Column G
  TRANSCRIPT: 7,         // Column H
  FROM_NUMBER: 8,        // Column I
  CUSTOMER_NAME: 9,      // Column J
  SERVICE_ADDRESS: 10,   // Column K
  EXTRACTED_CALL_SUMMARY: 11, // Column L
  EMAIL: 12,             // Column M
  PHONE: 13,             // Column N
  TECH_NAME: 14,         // Column O
  IS_EMERGENCY: 15,      // Column P
  
  // Automation control columns (matching other scripts)
  MAKE_CALL: 16,              // Column Q (make_call)
  RESPONSE_CALL_ID_1: 17,     // Column R (response_call_id_1)
  RESPONSE_CALL_ID_2: 18,     // Column S (response_call_id_2)
  RESPONSE_CALL_ID_3: 19,     // Column T (response_call_id_3)
  CALL_DECLINE_COUNTER: 20,   // Column U (call_decline_counter)
  LAST_CALL_TIME: 21,         // Column V (last_call_time)
  ESCALATION_COMPLETE: 22     // Column W (escalation_complete)
};

/**
 * Main webhook handler - processes incoming call data from Retell
 */
function doPost(e) {
  try {
    console.log('Received webhook data:', e.postData.contents);
    
    const data = JSON.parse(e.postData.contents);
    
    // Get the active sheet
    const sheet = SpreadsheetApp.getActiveSheet();
    
    // Add data to sheet
    const row = addDataToSheet(sheet, data);
    
    // Check if this is an emergency call that needs automation
    const isEmergency = data.isitEmergency === 'Yes' || data.isitEmergency === 'true' || data.isitEmergency === true;
    
    if (isEmergency) {
      console.log('Emergency call detected, starting escalation automation');
      
      // Initialize automation for this row
      initializeAutomation(sheet, row, data);
    }
    
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Data processed successfully',
        row: row,
        emergency: isEmergency
      }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error('Error processing webhook:', error);
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'error',
        message: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Add incoming data to the Google Sheet
 */
function addDataToSheet(sheet, data) {
  const timestamp = new Date().toISOString();
  const row = sheet.getLastRow() + 1;
  
  // Set basic call data
  sheet.getRange(row, COLUMNS.TIMESTAMP + 1).setValue(timestamp);
  sheet.getRange(row, COLUMNS.CALL_ID + 1).setValue(data.call_id || '');
  sheet.getRange(row, COLUMNS.AGENT_NAME + 1).setValue(data.agent_name || '');
  sheet.getRange(row, COLUMNS.CALL_DURATION + 1).setValue(data.call_duration || 0);
  sheet.getRange(row, COLUMNS.USER_SENTIMENT + 1).setValue(data.user_sentiment || '');
  sheet.getRange(row, COLUMNS.CALL_SUCCESSFUL + 1).setValue(data.call_successful || false);
  sheet.getRange(row, COLUMNS.CALL_SUMMARY + 1).setValue(data.call_summary || '');
  sheet.getRange(row, COLUMNS.TRANSCRIPT + 1).setValue(data.transcript || '');
  
  // Set extracted variables
  sheet.getRange(row, COLUMNS.FROM_NUMBER + 1).setValue(data.fromNumber || '');
  sheet.getRange(row, COLUMNS.CUSTOMER_NAME + 1).setValue(data.customerName || '');
  sheet.getRange(row, COLUMNS.SERVICE_ADDRESS + 1).setValue(data.serviceAddress || '');
  sheet.getRange(row, COLUMNS.EXTRACTED_CALL_SUMMARY + 1).setValue(data.callSummary || '');
  sheet.getRange(row, COLUMNS.EMAIL + 1).setValue(data.email || '');
  sheet.getRange(row, COLUMNS.PHONE + 1).setValue(data.phone || '');
  sheet.getRange(row, COLUMNS.TECH_NAME + 1).setValue(data.techName || '');
  sheet.getRange(row, COLUMNS.IS_EMERGENCY + 1).setValue(data.isitEmergency || '');
  
  // Initialize automation columns
  const isEmergency = data.isitEmergency === 'Yes' || data.isitEmergency === 'true' || data.isitEmergency === true;
  sheet.getRange(row, COLUMNS.MAKE_CALL + 1).setValue(isEmergency);
  sheet.getRange(row, COLUMNS.CALL_DECLINE_COUNTER + 1).setValue(0);
  sheet.getRange(row, COLUMNS.ESCALATION_COMPLETE + 1).setValue(false);
  
  console.log(`Data added to row ${row}`);
  return row;
}

/**
 * Initialize automation settings for an emergency call
 */
function initializeAutomation(sheet, row, data) {
  const now = new Date();
  
  // Determine starting step based on whether we have on-call tech
  const hasOnCallTech = data.phone && data.phone.trim() !== '';
  const startingStep = hasOnCallTech ? 1 : 3; // Start from step 3 if no on-call tech
  
  console.log(`Automation initialized for row ${row}, starting at step ${startingStep}`);
}

/**
 * Main escalation processing function - runs every 5 minutes
 */
function processAllEscalations() {
  try {
    console.log('Processing all active escalations...');
    
    const sheet = SpreadsheetApp.getActiveSheet();
    const lastRow = sheet.getLastRow();
    
    if (lastRow < 2) {
      console.log('No data rows to process');
      return;
    }
    
    // Get all data at once for efficiency
    const range = sheet.getRange(2, 1, lastRow - 1, COLUMNS.ESCALATION_COMPLETE + 1);
    const data = range.getValues();
    
    let processedCount = 0;
    
    // Process each row that has emergency calls and make_call = true
    for (let i = 0; i < data.length; i++) {
      const rowIndex = i + 2; // Adjust for 1-based indexing and header row
      const rowData = data[i];
      
      const makeCall = rowData[COLUMNS.MAKE_CALL];
      const isEmergency = rowData[COLUMNS.IS_EMERGENCY];
      const escalationComplete = rowData[COLUMNS.ESCALATION_COMPLETE];
      
      // Check conditions: make_call = true AND is_emergency = true AND not complete
      const makeCallCondition = (makeCall === true || makeCall === 'true' || makeCall === 'TRUE');
      const emergencyCondition = (isEmergency === true || isEmergency === 'true' || isEmergency === 'TRUE' ||
                                 isEmergency === 'yes' || isEmergency === 'YES' || isEmergency === 'Yes' || isEmergency === 1);
      
      if (makeCallCondition && emergencyCondition && !escalationComplete) {
        console.log(`Processing escalation for row ${rowIndex}`);
        processEscalationRow(sheet, rowIndex, rowData);
        processedCount++;
      }
    }
    
    console.log(`Processed ${processedCount} active escalations`);
    
  } catch (error) {
    console.error('Error in processAllEscalations:', error);
  }
}

/**
 * Process escalation for a specific row (similar to other scripts)
 */
function processEscalationRow(sheet, rowIndex, rowData) {
  try {
    const callId = rowData[COLUMNS.CALL_ID];
    const responseCallId1 = rowData[COLUMNS.RESPONSE_CALL_ID_1];
    const responseCallId2 = rowData[COLUMNS.RESPONSE_CALL_ID_2];
    const responseCallId3 = rowData[COLUMNS.RESPONSE_CALL_ID_3];
    const declineCounter = parseInt(rowData[COLUMNS.CALL_DECLINE_COUNTER]) || 0;
    const lastCallTime = rowData[COLUMNS.LAST_CALL_TIME];
    
    console.log(`Row ${rowIndex}: Counter=${declineCounter}, ResponseId1=${responseCallId1}, ResponseId2=${responseCallId2}, ResponseId3=${responseCallId3}`);
    
    // Check 10-minute delay before making any call
    if (!canMakeCall(lastCallTime)) {
      console.log(`Row ${rowIndex}: ⏳ Skipping - waiting for 10-minute delay`);
      return;
    }
    
    // Get call data
    const customerName = rowData[COLUMNS.CUSTOMER_NAME] || 'Customer';
    const serviceAddress = rowData[COLUMNS.SERVICE_ADDRESS] || 'Unknown address';
    const onCallTechPhone = rowData[COLUMNS.PHONE] || '';
    const onCallTechName = rowData[COLUMNS.TECH_NAME] || 'On-call technician';
    
    // Scenario 1: First call (response_call_id_1 is empty)
    if (!responseCallId1 || responseCallId1 === '') {
      console.log(`Row ${rowIndex}: 📞 Making FIRST escalation call`);
      const callInfo = getCallTarget(1, 0, onCallTechPhone, onCallTechName);
      
      if (callInfo) {
        const newCallId = makeRetellCall(callInfo.phone, callInfo.name, customerName, serviceAddress);
        if (newCallId) {
          sheet.getRange(rowIndex, COLUMNS.RESPONSE_CALL_ID_1 + 1).setValue(newCallId);
          sheet.getRange(rowIndex, COLUMNS.CALL_DECLINE_COUNTER + 1).setValue(1);
          recordCallTime(sheet, rowIndex);
          console.log(`Row ${rowIndex}: ✅ First call made, ID: ${newCallId}`);
        }
      }
      return;
    }
    
    // Scenario 2: Second call (counter = 1, check first call)
    if (declineCounter === 1) {
      console.log(`Row ${rowIndex}: Checking first call status and transfer`);
      
      // Check if first call is still ongoing
      const callStatusInfo = checkCallStatus(responseCallId1);
      if (callStatusInfo.status === 'ongoing' || callStatusInfo.status === 'in-progress') {
        console.log(`Row ${rowIndex}: First call still ongoing, skipping`);
        return;
      }
      
      // Check if transfer was invoked
      const transferInvoked = checkTransferCall(responseCallId1);
      if (transferInvoked) {
        sheet.getRange(rowIndex, COLUMNS.MAKE_CALL + 1).setValue(false);
        sheet.getRange(rowIndex, COLUMNS.ESCALATION_COMPLETE + 1).setValue(true);
        console.log(`Row ${rowIndex}: ✅ First call had transfer, automation disabled`);
        return;
      }
      
      // Make second call
      const callInfo = getCallTarget(2, 0, onCallTechPhone, onCallTechName);
      if (callInfo) {
        const newCallId = makeRetellCall(callInfo.phone, callInfo.name, customerName, serviceAddress);
        if (newCallId) {
          sheet.getRange(rowIndex, COLUMNS.RESPONSE_CALL_ID_2 + 1).setValue(newCallId);
          sheet.getRange(rowIndex, COLUMNS.CALL_DECLINE_COUNTER + 1).setValue(2);
          recordCallTime(sheet, rowIndex);
          console.log(`Row ${rowIndex}: ✅ Second call made, ID: ${newCallId}`);
        }
      }
      return;
    }
    
    // Scenario 3: Third call (counter = 2, check second call)
    if (declineCounter === 2) {
      console.log(`Row ${rowIndex}: Checking second call status and transfer`);
      
      const callStatusInfo = checkCallStatus(responseCallId2);
      if (callStatusInfo.status === 'ongoing' || callStatusInfo.status === 'in-progress') {
        console.log(`Row ${rowIndex}: Second call still ongoing, skipping`);
        return;
      }
      
      const transferInvoked = checkTransferCall(responseCallId2);
      if (transferInvoked) {
        sheet.getRange(rowIndex, COLUMNS.MAKE_CALL + 1).setValue(false);
        sheet.getRange(rowIndex, COLUMNS.ESCALATION_COMPLETE + 1).setValue(true);
        console.log(`Row ${rowIndex}: ✅ Second call had transfer, automation disabled`);
        return;
      }
      
      // Make third call (John McLean)
      const callInfo = getCallTarget(3, 0, onCallTechPhone, onCallTechName);
      if (callInfo) {
        const newCallId = makeRetellCall(callInfo.phone, callInfo.name, customerName, serviceAddress);
        if (newCallId) {
          sheet.getRange(rowIndex, COLUMNS.RESPONSE_CALL_ID_3 + 1).setValue(newCallId);
          sheet.getRange(rowIndex, COLUMNS.CALL_DECLINE_COUNTER + 1).setValue(3);
          recordCallTime(sheet, rowIndex);
          console.log(`Row ${rowIndex}: ✅ Third call made, ID: ${newCallId}`);
        }
      }
      return;
    }
    
    // Continue escalation for higher counters (Alex, John dual, Brian, continuous)
    if (declineCounter >= 3) {
      // Check if previous call had transfer
      if (responseCallId3) {
        const transferInvoked = checkTransferCall(responseCallId3);
        if (transferInvoked) {
          sheet.getRange(rowIndex, COLUMNS.MAKE_CALL + 1).setValue(false);
          sheet.getRange(rowIndex, COLUMNS.ESCALATION_COMPLETE + 1).setValue(true);
          console.log(`Row ${rowIndex}: ✅ Previous call had transfer, automation disabled`);
          return;
        }
      }
      
      // Continue with escalation steps 4-7
      const step = Math.min(declineCounter + 1, 7); // Cap at step 7 for continuous
      const callInfo = getCallTarget(step, 0, onCallTechPhone, onCallTechName);
      
      if (callInfo) {
        const newCallId = makeRetellCall(callInfo.phone, callInfo.name, customerName, serviceAddress);
        if (newCallId) {
          sheet.getRange(rowIndex, COLUMNS.CALL_DECLINE_COUNTER + 1).setValue(declineCounter + 1);
          recordCallTime(sheet, rowIndex);
          console.log(`Row ${rowIndex}: ✅ Escalation step ${step} call made, ID: ${newCallId}`);
        }
      }
    }
    
  } catch (error) {
    console.error(`Error processing escalation for row ${rowIndex}:`, error);
  }
}

/**
 * Check if enough time has passed since last call (10 minutes)
 */
function canMakeCall(lastCallTime) {
  if (!lastCallTime) {
    return true; // No previous call, can make first call
  }
  
  const currentTime = new Date().getTime();
  const lastCallTimestamp = new Date(lastCallTime).getTime();
  const timeSinceLastCall = currentTime - lastCallTimestamp;
  const minutesPassed = timeSinceLastCall / (60 * 1000);
  
  return minutesPassed >= CONFIG.DELAY_MINUTES;
}

/**
 * Record when a call was made
 */
function recordCallTime(sheet, rowIndex) {
  try {
    const currentTime = new Date();
    sheet.getRange(rowIndex, COLUMNS.LAST_CALL_TIME + 1).setValue(currentTime);
    console.log(`Row ${rowIndex}: 📝 Recorded call time: ${currentTime.toLocaleString()}`);
  } catch (error) {
    console.error(`Error recording call time for row ${rowIndex}:`, error);
  }
}

/**
 * Check the current status of a call
 */
function checkCallStatus(callId) {
  try {
    if (!callId) return { status: 'unknown', endTimestamp: null };
    
    const options = {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${CONFIG.RETELL_API_KEY}`,
        'Content-Type': 'application/json'
      }
    };
    
    const response = UrlFetchApp.fetch(`https://api.retellai.com/v2/get-call/${callId}`, options);
    const callData = JSON.parse(response.getContentText());
    
    const callStatus = callData.call_status || 'unknown';
    const endTimestamp = callData.end_timestamp || null;
    
    console.log(`Call ${callId} status: ${callStatus}`);
    
    return {
      status: callStatus,
      endTimestamp: endTimestamp
    };
  } catch (error) {
    console.error(`Error checking status for call ${callId}:`, error);
    return { status: 'unknown', endTimestamp: null };
  }
}

/**
 * Check if a transfer_call tool was invoked
 */
function checkTransferCall(callId) {
  try {
    if (!callId) return false;
    
    const options = {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${CONFIG.RETELL_API_KEY}`,
        'Content-Type': 'application/json'
      }
    };
    
    const response = UrlFetchApp.fetch(`https://api.retellai.com/v2/get-call/${callId}`, options);
    const callData = JSON.parse(response.getContentText());
    
    // Check for transfer_call in transcript_with_tool_calls
    if (callData.transcript_with_tool_calls) {
      for (const entry of callData.transcript_with_tool_calls) {
        if (entry.role === 'tool_call_invocation' && entry.name === 'transfer_call') {
          console.log(`Transfer call tool invoked for ${callId}`);
          return true;
        }
      }
    }
    
    console.log(`No transfer call tool invocation found for ${callId}`);
    return false;
  } catch (error) {
    console.error(`Error checking transfer for call ${callId}:`, error);
    return false;
  }
}

/**
 * Determine who to call based on current step and attempt number
 */
function getCallTarget(step, attempts, onCallTechPhone, onCallTechName) {
  switch (step) {
    case 1: // On-call technician (first call)
    case 2: // On-call technician (second call)
      if (onCallTechPhone) {
        return {
          phone: onCallTechPhone,
          name: onCallTechName || 'On-call technician'
        };
      }
      return null;
      
    case 3: // John McLean (primary)
      return {
        phone: CONFIG.CONTACTS.JOHN_MCLEAN_PRIMARY,
        name: 'John McLean'
      };
      
    case 4: // Alex Kovachev
      return {
        phone: CONFIG.CONTACTS.ALEX_KOVACHEV,
        name: 'Alex Kovachev'
      };
      
    case 5: // John McLean (both numbers)
      if (attempts % 2 === 0) {
        return {
          phone: CONFIG.CONTACTS.JOHN_MCLEAN_PRIMARY,
          name: 'John McLean (Primary)'
        };
      } else {
        return {
          phone: CONFIG.CONTACTS.JOHN_MCLEAN_SECONDARY,
          name: 'John McLean (Secondary)'
        };
      }
      
    case 6: // Brian Kerr
      return {
        phone: CONFIG.CONTACTS.BRIAN_KERR,
        name: 'Brian Kerr'
      };
      
    case 7: // John McLean continuous
      return {
        phone: CONFIG.CONTACTS.JOHN_MCLEAN_PRIMARY,
        name: 'John McLean (Continuous)'
      };
      
    default:
      return null;
  }
}

/**
 * Determine the next escalation step
 */
function getNextEscalationStep(currentStep, attempts) {
  switch (currentStep) {
    case 1: // First call to on-call tech
      return { step: 2, resetAttempts: true, complete: false };
      
    case 2: // Second call to on-call tech
      return { step: 3, resetAttempts: true, complete: false };
      
    case 3: // John McLean (primary)
      return { step: 4, resetAttempts: true, complete: false };
      
    case 4: // Alex Kovachev
      return { step: 5, resetAttempts: true, complete: false };
      
    case 5: // John McLean (both numbers)
      if (attempts >= 2) { // Called both numbers
        return { step: 6, resetAttempts: true, complete: false };
      }
      return { step: 5, resetAttempts: false, complete: false };
      
    case 6: // Brian Kerr
      return { step: 7, resetAttempts: true, complete: false };
      
    case 7: // John McLean continuous
      return { step: 7, resetAttempts: true, complete: false }; // Continue indefinitely
      
    default:
      return { step: currentStep, resetAttempts: false, complete: true };
  }
}

/**
 * Make a call using Retell API
 */
function makeRetellCall(phoneNumber, contactName, customerName, serviceAddress) {
  try {
    console.log(`Making call to ${contactName} at ${phoneNumber}`);
    
    // Prepare call context
    const callContext = {
      customer_name: customerName,
      service_address: serviceAddress,
      contact_name: contactName,
      escalation_call: true
    };
    
    const payload = {
      from_number: '+14169012663', // Adaptive Climate's number
      to_number: phoneNumber,
      agent_id: CONFIG.RETELL_AGENT_ID,
      retell_llm_dynamic_variables: callContext
    };
    
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONFIG.RETELL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload)
    };
    
    const response = UrlFetchApp.fetch('https://api.retellai.com/v2/create-phone-call', options);
    const responseData = JSON.parse(response.getContentText());
    
    if (response.getResponseCode() === 201 || response.getResponseCode() === 200) {
      console.log('Call initiated successfully:', responseData.call_id);
      return responseData.call_id; // Return just the call ID
    } else {
      console.error('Failed to initiate call:', responseData);
      return null;
    }
    
  } catch (error) {
    console.error('Error making Retell call:', error);
    return null;
  }
}

/**
 * Manual trigger function for testing
 */
function testEscalation() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const lastRow = sheet.getLastRow();
  
  if (lastRow >= 2) {
    console.log(`Testing escalation processing for all rows`);
    processAllEscalations();
  } else {
    console.log('No data rows to test');
  }
}

/**
 * Setup function to create necessary triggers and initialize sheet
 * Run this once to set up the time-based trigger
 */
function setupTriggers() {
  try {
    const sheet = SpreadsheetApp.getActiveSheet();
    
    // Add ALL column headers (basic data columns)
    sheet.getRange(1, COLUMNS.TIMESTAMP + 1).setValue('timestamp');
    sheet.getRange(1, COLUMNS.CALL_ID + 1).setValue('call_id');
    sheet.getRange(1, COLUMNS.AGENT_NAME + 1).setValue('agent_name');
    sheet.getRange(1, COLUMNS.CALL_DURATION + 1).setValue('call_duration');
    sheet.getRange(1, COLUMNS.USER_SENTIMENT + 1).setValue('user_sentiment');
    sheet.getRange(1, COLUMNS.CALL_SUCCESSFUL + 1).setValue('call_successful');
    sheet.getRange(1, COLUMNS.CALL_SUMMARY + 1).setValue('call_summary');
    sheet.getRange(1, COLUMNS.TRANSCRIPT + 1).setValue('transcript');
    sheet.getRange(1, COLUMNS.FROM_NUMBER + 1).setValue('from_number');
    sheet.getRange(1, COLUMNS.CUSTOMER_NAME + 1).setValue('customer_name');
    sheet.getRange(1, COLUMNS.SERVICE_ADDRESS + 1).setValue('service_address');
    sheet.getRange(1, COLUMNS.EXTRACTED_CALL_SUMMARY + 1).setValue('extracted_call_summary');
    sheet.getRange(1, COLUMNS.EMAIL + 1).setValue('email');
    sheet.getRange(1, COLUMNS.PHONE + 1).setValue('phone');
    sheet.getRange(1, COLUMNS.TECH_NAME + 1).setValue('tech_name');
    sheet.getRange(1, COLUMNS.IS_EMERGENCY + 1).setValue('is_emergency');
    
    // Add automation column headers (matching other scripts)
    sheet.getRange(1, COLUMNS.MAKE_CALL + 1).setValue('make_call');
    sheet.getRange(1, COLUMNS.RESPONSE_CALL_ID_1 + 1).setValue('response_call_id_1');
    sheet.getRange(1, COLUMNS.RESPONSE_CALL_ID_2 + 1).setValue('response_call_id_2');
    sheet.getRange(1, COLUMNS.RESPONSE_CALL_ID_3 + 1).setValue('response_call_id_3');
    sheet.getRange(1, COLUMNS.CALL_DECLINE_COUNTER + 1).setValue('call_decline_counter');
    sheet.getRange(1, COLUMNS.LAST_CALL_TIME + 1).setValue('last_call_time');
    sheet.getRange(1, COLUMNS.ESCALATION_COMPLETE + 1).setValue('escalation_complete');
    
    // Initialize existing rows with default values
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      // Set call_decline_counter = 0 for all existing rows
      const counterRange = sheet.getRange(2, COLUMNS.CALL_DECLINE_COUNTER + 1, lastRow - 1, 1);
      const counterValues = Array(lastRow - 1).fill([0]);
      counterRange.setValues(counterValues);
      
      // Set escalation_complete = false for all existing rows
      const completeRange = sheet.getRange(2, COLUMNS.ESCALATION_COMPLETE + 1, lastRow - 1, 1);
      const completeValues = Array(lastRow - 1).fill([false]);
      completeRange.setValues(completeValues);
    }
    
    // Delete existing triggers
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'processAllEscalations') {
        ScriptApp.deleteTrigger(trigger);
      }
    });
    
    // Create new trigger to run every 5 minutes
    ScriptApp.newTrigger('processAllEscalations')
      .timeBased()
      .everyMinutes(5)
      .create();
      
    console.log('✅ Adaptive Climate escalation system setup complete!');
    console.log('📋 Escalation Flow: On-call tech → John McLean → Alex Kovachev → John McLean (2 numbers) → Brian Kerr → John McLean (continuous)');
    console.log('⏰ Trigger created to run processAllEscalations every 5 minutes');
    console.log('🔄 Transfer detection enabled - escalation stops if transfer_call tool is invoked');
    console.log('📊 All column headers added to Google Sheet');
    
  } catch (error) {
    console.error('Error in setupTriggers:', error);
  }
}

