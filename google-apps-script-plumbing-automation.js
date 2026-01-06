/**
 * Plumbing/HVAC Call Automation System for Google Sheets
 * 
 * This script runs every 1 minute to process outbound calls based on sheet data
 * Handles call attempts, transfer detection, call status checking, and retry logic
 * 
 * Based on Sheet 2 automation but adapted for Plumbing/HVAC emergencies
 * 
 * Spreadsheet: https://docs.google.com/spreadsheets/d/1cbdvP5c-6QgZYsaXvVeTOD4VlYPKBV_yccY-lI8UFa0/edit
 */

// Configuration
const CONFIG = {
  RETELL_API_KEY: 'your_retell_api_key_here',
  FROM_NUMBER: '+1XXXXXXXXXX',
  AGENT_ID: 'agent_your_agent_id_here',
  FALLBACK_NUMBER: '+1XXXXXXXXXX', // Default fallback, will be replaced by dynamic lookup
  SHEET_NAME: 'Call Data',
  
  // Plumbing/HVAC API Configuration
  PLUMBING_API: 'https://plumbing-api.vercel.app/api/assignments',
  HVAC_API: 'https://hvacapi.vercel.app/api/assignments',
  
  // Column indices (0-based) - UPDATE THESE TO MATCH YOUR SHEET
  COLUMNS: {
    CALL_ID: 1,              // Column B (Call ID)
    CUSTOMER_NAME: 8,        // Column I (Customer Name)
    SERVICE_ADDRESS: 9,      // Column J (Service Address)
    TRANSCRIPT: 14,          // Column O (Transcript)
    CALL_SUMMARY: 6,         // Column G (Call Summary)
    FROM_NUMBER: 7,          // Column H (From Number)
    TECH_PHONE: 11,          // Column L (Phone)
    IS_EMERGENCY: 12,        // Column M (Is Emergency)
    EMERGENCY_TYPE: 13,      // Column N (Emergency Type)
    // New columns to add
    MAKE_CALL: 16,           // Column Q (make_call)
    RESPONSE_CALL_ID_1: 17,  // Column R (response_call_id_1)
    RESPONSE_CALL_ID_2: 18,  // Column S (response_call_id_2)
    RESPONSE_CALL_ID_3: 19,  // Column T (response_call_id_3)
    CALL_DECLINE_COUNTER: 20 // Column U (call_decline_counter)
  }
};

/**
 * Main function - runs every 1 minute via time-based trigger
 */
function processCallAutomation() {
  try {
    console.log('Starting Plumbing/HVAC call automation process...');
    
    const sheet = SpreadsheetApp.openById('1cbdvP5c-6QgZYsaXvVeTOD4VlYPKBV_yccY-lI8UFa0').getSheetByName(CONFIG.SHEET_NAME);
    const lastRow = sheet.getLastRow();
    
    if (lastRow <= 1) {
      console.log('No data rows found');
      return;
    }
    
    // Get all data at once for efficiency
    const range = sheet.getRange(2, 1, lastRow - 1, CONFIG.COLUMNS.CALL_DECLINE_COUNTER + 1);
    const data = range.getValues();
    
    console.log(`Processing ${data.length} rows`);
    
    // Process each row
    for (let i = 0; i < data.length; i++) {
      const rowIndex = i + 2; // Actual sheet row number
      const rowData = data[i];
      
      // Check if make_call is true AND is emergency
      const makeCall = rowData[CONFIG.COLUMNS.MAKE_CALL];
      const isEmergency = rowData[CONFIG.COLUMNS.IS_EMERGENCY];
      
      // Debug logging for each row
      console.log(`Row ${rowIndex}: make_call='${makeCall}' (type: ${typeof makeCall}), is_emergency='${isEmergency}' (type: ${typeof isEmergency})`);
      
      // Check conditions: (make_call = true OR null/empty) AND is_emergency = true
      const makeCallCondition = (makeCall === true || makeCall === 'true' || makeCall === 'TRUE' ||
                                makeCall === null || makeCall === undefined || makeCall === '');
      const emergencyCondition = (isEmergency === true || isEmergency === 'true' || isEmergency === 'TRUE' ||
                                 isEmergency === 'yes' || isEmergency === 'YES' || isEmergency === 1);
      
      if (makeCallCondition && emergencyCondition) {
        console.log(`Processing EMERGENCY row ${rowIndex}, Call ID: ${rowData[CONFIG.COLUMNS.CALL_ID]}`);
        
        // Set make_call = true if it was null/empty
        if (makeCall === null || makeCall === undefined || makeCall === '') {
          sheet.getRange(rowIndex, CONFIG.COLUMNS.MAKE_CALL + 1).setValue(true);
          console.log(`Set make_call=true for row ${rowIndex}`);
        }
        
        processCallRow(sheet, rowIndex, rowData);
      } else if (makeCallCondition) {
        console.log(`Skipping row ${rowIndex} - make_call condition met but not emergency (is_emergency='${isEmergency}')`);
      } else {
        console.log(`Skipping row ${rowIndex} - make_call='${makeCall}', is_emergency='${isEmergency}'`);
      }
    }
    
    console.log('Plumbing/HVAC call automation process completed');
  } catch (error) {
    console.error('Error in processCallAutomation:', error);
  }
}

/**
 * Process a single row for call automation
 */
function processCallRow(sheet, rowIndex, rowData) {
  try {
    const callId = rowData[CONFIG.COLUMNS.CALL_ID];
    const responseCallId1 = rowData[CONFIG.COLUMNS.RESPONSE_CALL_ID_1];
    const responseCallId2 = rowData[CONFIG.COLUMNS.RESPONSE_CALL_ID_2];
    const responseCallId3 = rowData[CONFIG.COLUMNS.RESPONSE_CALL_ID_3];
    const declineCounter = parseInt(rowData[CONFIG.COLUMNS.CALL_DECLINE_COUNTER]) || 0;
    
    console.log(`Row ${rowIndex}: Counter=${declineCounter}, ResponseId1=${responseCallId1}, ResponseId2=${responseCallId2}, ResponseId3=${responseCallId3}`);
    
    // Scenario 1: response_call_id_1 is empty
    if (!responseCallId1 || responseCallId1 === '') {
      console.log(`Row ${rowIndex}: Making first outbound call`);
      const newCallId = makeOutboundCall(rowData, false); // Use tech phone
      if (newCallId) {
        // Update response_call_id_1 and increment counter
        sheet.getRange(rowIndex, CONFIG.COLUMNS.RESPONSE_CALL_ID_1 + 1).setValue(newCallId);
        sheet.getRange(rowIndex, CONFIG.COLUMNS.CALL_DECLINE_COUNTER + 1).setValue(1);
        console.log(`Row ${rowIndex}: First call made, ID: ${newCallId}`);
      }
      return;
    }
    
    // Scenario 2: Counter = 1, check first call
    if (declineCounter === 1) {
      console.log(`Row ${rowIndex}: Checking first call status and transfer tool invocation`);
      
      // First check if the call is still ongoing
      const callStatusInfo = checkCallStatus(responseCallId1);
      if (callStatusInfo.status === 'ongoing' || callStatusInfo.status === 'in-progress') {
        console.log(`Row ${rowIndex}: First call is still ongoing (${callStatusInfo.status}), skipping for now`);
        return; // Skip this execution, will be picked up in next run
      }
      
      // If call has ended, check if 5 minutes have passed since end_timestamp
      if (callStatusInfo.status === 'ended' && callStatusInfo.endTimestamp) {
        if (!hasEnoughTimePassed(callStatusInfo.endTimestamp)) {
          console.log(`Row ${rowIndex}: First call ended but 5 minutes haven't passed yet, waiting...`);
          return; // Skip this execution, will be picked up in next run
        }
      }
      
      const transferInvoked = checkTransferCall(responseCallId1);
      if (transferInvoked) {
        // Transfer tool was invoked - disable make_call
        sheet.getRange(rowIndex, CONFIG.COLUMNS.MAKE_CALL + 1).setValue(false);
        console.log(`Row ${rowIndex}: First call had transfer invocation, automation disabled`);
      } else {
        // No transfer invocation - make second call
        console.log(`Row ${rowIndex}: First call had no transfer invocation and 5 minutes have passed, making second call`);
        const newCallId = makeOutboundCall(rowData, false); // Use tech phone again
        if (newCallId) {
          sheet.getRange(rowIndex, CONFIG.COLUMNS.RESPONSE_CALL_ID_2 + 1).setValue(newCallId);
          sheet.getRange(rowIndex, CONFIG.COLUMNS.CALL_DECLINE_COUNTER + 1).setValue(2);
          console.log(`Row ${rowIndex}: Second call made, ID: ${newCallId}`);
        }
      }
      return;
    }
    
    // Scenario 3: Counter = 2, check second call
    if (declineCounter === 2) {
      console.log(`Row ${rowIndex}: Checking second call status and transfer tool invocation`);
      
      // First check if the call is still ongoing
      const callStatusInfo = checkCallStatus(responseCallId2);
      if (callStatusInfo.status === 'ongoing' || callStatusInfo.status === 'in-progress') {
        console.log(`Row ${rowIndex}: Second call is still ongoing (${callStatusInfo.status}), skipping for now`);
        return; // Skip this execution, will be picked up in next run
      }
      
      // If call has ended, check if 5 minutes have passed since end_timestamp
      if (callStatusInfo.status === 'ended' && callStatusInfo.endTimestamp) {
        if (!hasEnoughTimePassed(callStatusInfo.endTimestamp)) {
          console.log(`Row ${rowIndex}: Second call ended but 5 minutes haven't passed yet, waiting...`);
          return; // Skip this execution, will be picked up in next run
        }
      }
      
      const transferInvoked = checkTransferCall(responseCallId2);
      if (transferInvoked) {
        // Transfer tool was invoked - disable make_call
        sheet.getRange(rowIndex, CONFIG.COLUMNS.MAKE_CALL + 1).setValue(false);
        console.log(`Row ${rowIndex}: Second call had transfer invocation, automation disabled`);
      } else {
        // No transfer invocation - make third call
        console.log(`Row ${rowIndex}: Second call had no transfer invocation and 5 minutes have passed, making third call`);
        const newCallId = makeOutboundCall(rowData, false); // Use tech phone again
        if (newCallId) {
          sheet.getRange(rowIndex, CONFIG.COLUMNS.RESPONSE_CALL_ID_3 + 1).setValue(newCallId);
          sheet.getRange(rowIndex, CONFIG.COLUMNS.CALL_DECLINE_COUNTER + 1).setValue(3);
          console.log(`Row ${rowIndex}: Third call made, ID: ${newCallId}`);
        }
      }
      return;
    }
    
    // Scenario 4: Counter = 3, check third call
    if (declineCounter === 3) {
      console.log(`Row ${rowIndex}: Checking third call status and transfer tool invocation`);
      
      // First check if the call is still ongoing
      const callStatusInfo = checkCallStatus(responseCallId3);
      if (callStatusInfo.status === 'ongoing' || callStatusInfo.status === 'in-progress') {
        console.log(`Row ${rowIndex}: Third call is still ongoing (${callStatusInfo.status}), skipping for now`);
        return; // Skip this execution, will be picked up in next run
      }
      
      // If call has ended, check if 5 minutes have passed since end_timestamp
      if (callStatusInfo.status === 'ended' && callStatusInfo.endTimestamp) {
        if (!hasEnoughTimePassed(callStatusInfo.endTimestamp)) {
          console.log(`Row ${rowIndex}: Third call ended but 5 minutes haven't passed yet, waiting...`);
          return; // Skip this execution, will be picked up in next run
        }
      }
      
      const transferInvoked = checkTransferCall(responseCallId3);
      if (transferInvoked) {
        // Transfer tool was invoked - disable make_call
        sheet.getRange(rowIndex, CONFIG.COLUMNS.MAKE_CALL + 1).setValue(false);
        console.log(`Row ${rowIndex}: Third call had transfer invocation, automation disabled`);
      } else {
        // No transfer invocation - make final fallback call
        console.log(`Row ${rowIndex}: Third call had no transfer invocation and 5 minutes have passed, making fallback call`);
        const newCallId = makeOutboundCall(rowData, true); // Use fallback number
        if (newCallId) {
          // Disable automation after fallback call
          sheet.getRange(rowIndex, CONFIG.COLUMNS.MAKE_CALL + 1).setValue(false);
          console.log(`Row ${rowIndex}: Fallback call made, ID: ${newCallId}, automation disabled`);
        }
      }
      return;
    }
    
    // Counter > 3, should not happen but disable automation
    if (declineCounter > 3) {
      sheet.getRange(rowIndex, CONFIG.COLUMNS.MAKE_CALL + 1).setValue(false);
      console.log(`Row ${rowIndex}: Counter > 3, disabling automation`);
    }
  } catch (error) {
    console.error(`Error processing row ${rowIndex}:`, error);
  }
}

/**
 * Get fallback phone number from Plumbing/HVAC APIs
 */
function getFallbackNumber(emergencyType) {
  try {
    console.log(`[API] Getting fallback number for emergency type: ${emergencyType}`);
    
    let primaryApi, fallbackApi;
    
    // Determine API priority based on emergency type
    if (emergencyType === 'Plumbing') {
      primaryApi = CONFIG.PLUMBING_API;
      fallbackApi = CONFIG.HVAC_API;
    } else {
      primaryApi = CONFIG.HVAC_API;
      fallbackApi = CONFIG.PLUMBING_API;
    }
    
    // Try primary API first
    let techPhone = tryGetTechPhone(primaryApi);
    if (techPhone) {
      console.log(`[API] Got tech phone from primary API: ${techPhone}`);
      return formatPhoneNumber(techPhone);
    }
    
    // Try fallback API
    techPhone = tryGetTechPhone(fallbackApi);
    if (techPhone) {
      console.log(`[API] Got tech phone from fallback API: ${techPhone}`);
      return formatPhoneNumber(techPhone);
    }
    
    console.log('[API] No tech phone found from APIs, using default fallback');
    return CONFIG.FALLBACK_NUMBER;
    
  } catch (error) {
    console.error('[API] Error getting fallback number:', error);
    return CONFIG.FALLBACK_NUMBER;
  }
}

/**
 * Try to get tech phone from a specific API
 */
function tryGetTechPhone(apiUrl) {
  try {
    const response = UrlFetchApp.fetch(apiUrl, { muteHttpExceptions: true });
    
    if (response.getResponseCode() === 200) {
      const data = JSON.parse(response.getContentText());
      const assignments = data.assignments || [];
      
      for (const assignment of assignments) {
        const techs = assignment.techs || [];
        for (const tech of techs) {
          if (tech.phone && tech.phone !== 'null' && tech.phone !== '') {
            return tech.phone;
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching from ${apiUrl}:`, error);
    return null;
  }
}

/**
 * Format phone number to +1XXXXXXXXXX format
 */
function formatPhoneNumber(phoneNumber) {
  if (!phoneNumber) return '';
  
  // Convert to string and remove all non-digit characters
  let digits = String(phoneNumber).replace(/\D/g, '');
  
  // Handle different digit lengths
  if (digits.length === 10) {
    // 2063385620 -> +12063385620
    return '+1' + digits;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    // 12063385620 -> +12063385620
    return '+' + digits;
  } else if (digits.length === 11 && !digits.startsWith('1')) {
    // Assume it's missing country code, add +1
    return '+1' + digits.slice(-10);
  } else if (digits.length > 11) {
    // Take last 10 digits and add +1
    return '+1' + digits.slice(-10);
  } else {
    // Less than 10 digits, return as is with +1 prefix
    return '+1' + digits;
  }
}

/**
 * Make an outbound call via Retell AI API
 */
function makeOutboundCall(rowData, useFallback = false) {
  try {
    const apiKey = PropertiesService.getScriptProperties().getProperty('RETELL_API_KEY') || CONFIG.RETELL_API_KEY;
    
    // Determine and format phone numbers
    let rawToNumber;
    if (useFallback) {
      // Get dynamic fallback number from Plumbing/HVAC APIs
      const emergencyType = rowData[CONFIG.COLUMNS.EMERGENCY_TYPE] || 'HVAC';
      rawToNumber = getFallbackNumber(emergencyType);
    } else {
      // Use tech phone or get dynamic fallback as backup
      const emergencyType = rowData[CONFIG.COLUMNS.EMERGENCY_TYPE] || 'HVAC';
      rawToNumber = rowData[CONFIG.COLUMNS.TECH_PHONE] || getFallbackNumber(emergencyType);
    }
    
    const toNumber = formatPhoneNumber(rawToNumber);
    const transferNumber = formatPhoneNumber(rowData[CONFIG.COLUMNS.FROM_NUMBER]);
    
    console.log(`Raw tech phone: '${rawToNumber}' -> Formatted: '${toNumber}'`);
    console.log(`Raw from number: '${rowData[CONFIG.COLUMNS.FROM_NUMBER]}' -> Formatted: '${transferNumber}'`);
    
    const payload = {
      from_number: CONFIG.FROM_NUMBER,
      to_number: toNumber,
      override_agent_id: CONFIG.AGENT_ID,
      retell_llm_dynamic_variables: {
        customer_name: String(rowData[CONFIG.COLUMNS.CUSTOMER_NAME] || ''),
        customer_address: String(rowData[CONFIG.COLUMNS.SERVICE_ADDRESS] || ''),
        transcript: String(rowData[CONFIG.COLUMNS.TRANSCRIPT] || ''),
        call_summary: String(rowData[CONFIG.COLUMNS.CALL_SUMMARY] || ''),
        transfer_number: transferNumber,
        emergency_type: String(rowData[CONFIG.COLUMNS.EMERGENCY_TYPE] || ''),
        is_emergency: String(rowData[CONFIG.COLUMNS.IS_EMERGENCY] || ''),
        call_purpose: useFallback ? 'fallback_emergency_call' : 'emergency_notification'
      }
    };
    
    const options = {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload)
    };
    
    console.log('Making outbound call to:', toNumber);
    console.log('Payload:', payload);
    
    const response = UrlFetchApp.fetch('https://api.retellai.com/v2/create-phone-call', options);
    const responseData = JSON.parse(response.getContentText());
    
    if (response.getResponseCode() === 200 || response.getResponseCode() === 201) {
      console.log('Call created successfully:', responseData.call_id);
      return responseData.call_id;
    } else {
      console.error('API error:', responseData);
      return null;
    }
  } catch (error) {
    console.error('Error making outbound call:', error);
    return null;
  }
}

/**
 * Check the current status of a call and return status with timing info
 */
function checkCallStatus(callId) {
  try {
    if (!callId) return { status: 'unknown', endTimestamp: null };
    
    const apiKey = PropertiesService.getScriptProperties().getProperty('RETELL_API_KEY') || CONFIG.RETELL_API_KEY;
    
    const options = {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      }
    };
    
    const response = UrlFetchApp.fetch(`https://api.retellai.com/v2/get-call/${callId}`, options);
    const callData = JSON.parse(response.getContentText());
    
    const callStatus = callData.call_status || 'unknown';
    const endTimestamp = callData.end_timestamp || null;
    
    console.log(`Call ${callId} status: ${callStatus}, end_timestamp: ${endTimestamp}`);
    
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
 * Check if enough time has passed since call ended (5 minutes)
 */
function hasEnoughTimePassed(endTimestamp) {
  if (!endTimestamp) return false;
  
  const currentTime = new Date().getTime(); // Current time in milliseconds
  const fiveMinutesInMs = 5 * 60 * 1000; // 5 minutes in milliseconds
  const waitUntilTime = endTimestamp + fiveMinutesInMs;
  
  console.log(`Current time: ${currentTime}, Call ended: ${endTimestamp}, Wait until: ${waitUntilTime}`);
  console.log(`Time passed: ${(currentTime - endTimestamp) / 1000 / 60} minutes`);
  
  return currentTime >= waitUntilTime;
}

/**
 * Check if a transfer_call tool was invoked (regardless of success/failure)
 */
function checkTransferCall(callId) {
  try {
    if (!callId) return false;
    
    const apiKey = PropertiesService.getScriptProperties().getProperty('RETELL_API_KEY') || CONFIG.RETELL_API_KEY;
    
    const options = {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      }
    };
    
    const response = UrlFetchApp.fetch(`https://api.retellai.com/v2/get-call/${callId}`, options);
    const callData = JSON.parse(response.getContentText());
    
    console.log(`Checking transfer tool invocation for call ${callId}`);
    
    // Check for transfer_call in transcript_with_tool_calls
    if (callData.transcript_with_tool_calls) {
      for (const entry of callData.transcript_with_tool_calls) {
        if (entry.role === 'tool_call_invocation' && entry.name === 'transfer_call') {
          // Just check if transfer_call was invoked, not success/failure
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
 * Setup function - run this once to initialize the system
 */
function setupCallAutomation() {
  try {
    const sheet = SpreadsheetApp.openById('1cbdvP5c-6QgZYsaXvVeTOD4VlYPKBV_yccY-lI8UFa0').getSheetByName(CONFIG.SHEET_NAME);
    
    // Set up Script Properties for sensitive data
    const properties = PropertiesService.getScriptProperties();
    properties.setProperties({
      'RETELL_API_KEY': CONFIG.RETELL_API_KEY
    });
    
    // Add new column headers
    sheet.getRange(1, CONFIG.COLUMNS.MAKE_CALL + 1).setValue('make_call');
    sheet.getRange(1, CONFIG.COLUMNS.RESPONSE_CALL_ID_1 + 1).setValue('response_call_id_1');
    sheet.getRange(1, CONFIG.COLUMNS.RESPONSE_CALL_ID_2 + 1).setValue('response_call_id_2');
    sheet.getRange(1, CONFIG.COLUMNS.RESPONSE_CALL_ID_3 + 1).setValue('response_call_id_3');
    sheet.getRange(1, CONFIG.COLUMNS.CALL_DECLINE_COUNTER + 1).setValue('call_decline_counter');
    
    // Initialize existing rows with default values
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      // Set make_call = true for all existing rows
      const makeCallRange = sheet.getRange(2, CONFIG.COLUMNS.MAKE_CALL + 1, lastRow - 1, 1);
      const makeCallValues = Array(lastRow - 1).fill([true]);
      makeCallRange.setValues(makeCallValues);
      
      // Set call_decline_counter = 0 for all existing rows
      const counterRange = sheet.getRange(2, CONFIG.COLUMNS.CALL_DECLINE_COUNTER + 1, lastRow - 1, 1);
      const counterValues = Array(lastRow - 1).fill([0]);
      counterRange.setValues(counterValues);
    }
    
    // Delete existing triggers
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'processCallAutomation') {
        ScriptApp.deleteTrigger(trigger);
      }
    });
    
    // Create 1-minute timer trigger
    ScriptApp.newTrigger('processCallAutomation')
      .timeBased()
      .everyMinutes(1)
      .create();
    
    console.log('Plumbing/HVAC call automation setup complete!');
    console.log('IMPORTANT: Make sure your webhook appends rows at the bottom');
  } catch (error) {
    console.error('Error in setup:', error);
  }
}

/**
 * Test function
 */
function testCallAutomation() {
  // Test with a small subset
  processCallAutomation();
}

/**
 * Test API connections
 */
function testAPIs() {
  console.log('=== TESTING PLUMBING/HVAC APIs ===');
  
  console.log('Testing Plumbing API...');
  const plumbingPhone = tryGetTechPhone(CONFIG.PLUMBING_API);
  console.log(`Plumbing API result: ${plumbingPhone || 'No phone found'}`);
  
  console.log('Testing HVAC API...');
  const hvacPhone = tryGetTechPhone(CONFIG.HVAC_API);
  console.log(`HVAC API result: ${hvacPhone || 'No phone found'}`);
  
  console.log('Testing fallback number for Plumbing...');
  const plumbingFallback = getFallbackNumber('Plumbing');
  console.log(`Plumbing fallback: ${plumbingFallback}`);
  
  console.log('Testing fallback number for HVAC...');
  const hvacFallback = getFallbackNumber('HVAC');
  console.log(`HVAC fallback: ${hvacFallback}`);
  
  console.log('=== API TEST COMPLETED ===');
}

/**
 * Debug function to check current column values
 */
function debugRowValues() {
  const sheet = SpreadsheetApp.openById('1cbdvP5c-6QgZYsaXvVeTOD4VlYPKBV_yccY-lI8UFa0').getSheetByName(CONFIG.SHEET_NAME);
  const lastRow = sheet.getLastRow();
  
  console.log('=== DEBUGGING ROW VALUES ===');
  console.log(`Total rows: ${lastRow}`);
  
  if (lastRow <= 1) {
    console.log('No data rows found');
    return;
  }
  
  // Check first few rows
  const rowsToCheck = Math.min(5, lastRow - 1);
  const range = sheet.getRange(2, 1, rowsToCheck, CONFIG.COLUMNS.CALL_DECLINE_COUNTER + 1);
  const data = range.getValues();
  
  for (let i = 0; i < data.length; i++) {
    const rowIndex = i + 2;
    const rowData = data[i];
    
    console.log(`Row ${rowIndex}:`);
    console.log(`  Call ID: '${rowData[CONFIG.COLUMNS.CALL_ID]}'`);
    console.log(`  Customer Name: '${rowData[CONFIG.COLUMNS.CUSTOMER_NAME]}'`);
    console.log(`  Is Emergency: '${rowData[CONFIG.COLUMNS.IS_EMERGENCY]}' (type: ${typeof rowData[CONFIG.COLUMNS.IS_EMERGENCY]})`);
    console.log(`  Emergency Type: '${rowData[CONFIG.COLUMNS.EMERGENCY_TYPE]}'`);
    console.log(`  Make Call: '${rowData[CONFIG.COLUMNS.MAKE_CALL]}' (type: ${typeof rowData[CONFIG.COLUMNS.MAKE_CALL]})`);
    console.log(`  Tech Phone: '${rowData[CONFIG.COLUMNS.TECH_PHONE]}'`);
    console.log('---');
  }
}