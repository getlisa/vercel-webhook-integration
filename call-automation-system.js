/**
 * Call Automation System for Google Sheets
 * 
 * This script runs every 1 minute to process outbound calls based on sheet data
 * Handles call attempts, transfer detection, call status checking, and retry logic
 * 
 * IMPORTANT: Fix webhook to append rows at bottom to avoid data shifting issues
 */

// Configuration
const CONFIG = {
  RETELL_API_KEY: 'YOUR_RETELL_API_KEY', // Set in Script Properties
  FROM_NUMBER: '+17789465528',
  AGENT_ID: 'agent_88461729280fe5f698d7141451',
  FALLBACK_NUMBER: '+12063385620', // Default fallback, will be replaced by dynamic lookup
  SHEET_NAME: 'Sheet1',

  // ServiceTrade API Configuration
  SERVICETRADE: {
    AUTH_URL: 'https://app.servicetrade.com/api/auth',
    USER_API_URL: 'https://api.servicetrade.com/api/user',
    USERNAME: 'pavan.kalyan',
    PASSWORD: 'Claraai2025!',
    FALLBACK_USER: 'brad westen'
  },

  // Column indices (0-based) - UPDATE THESE TO MATCH YOUR SHEET
  COLUMNS: {
    CALL_ID: 1,              // Column B (Call ID)
    CUSTOMER_NAME: 9,        // Column J (Customer Name)
    SERVICE_ADDRESS: 10,     // Column K (Service Address)
    TRANSCRIPT: 7,           // Column H (Transcript)
    CALL_SUMMARY: 6,         // Column G (Call Summary)
    FROM_NUMBER: 8,          // Column I (From Number)
    TECH_PHONE: 13,          // Column N (Tech Phone)
    IS_EMERGENCY: 14,        // Column O (Is Emergency)

    // New columns to add
    MAKE_CALL: 16,           // Column Q (make_call)
    RESPONSE_CALL_ID_1: 17,  // Column R (response_call_id_1)
    RESPONSE_CALL_ID_2: 18,  // Column S (response_call_id_2)
    CALL_DECLINE_COUNTER: 19 // Column T (call_decline_counter)
  }
};

/**
 * Main function - runs every 1 minute via time-based trigger
 */
function processCallAutomation() {
  try {
    console.log('Starting call automation process...');

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
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

    console.log('Call automation process completed');

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
    const declineCounter = parseInt(rowData[CONFIG.COLUMNS.CALL_DECLINE_COUNTER]) || 0;

    console.log(`Row ${rowIndex}: Counter=${declineCounter}, ResponseId1=${responseCallId1}, ResponseId2=${responseCallId2}`);

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

      // No delay for scenario 3 - proceed immediately once call is not ongoing
      const transferInvoked = checkTransferCall(responseCallId2);

      if (transferInvoked) {
        // Transfer tool was invoked - disable make_call
        sheet.getRange(rowIndex, CONFIG.COLUMNS.MAKE_CALL + 1).setValue(false);
        console.log(`Row ${rowIndex}: Second call had transfer invocation, automation disabled`);
      } else {
        // No transfer invocation - make final call to fallback number
        console.log(`Row ${rowIndex}: Second call had no transfer invocation, making fallback call`);

        const newCallId = makeOutboundCall(rowData, true); // Use fallback number

        if (newCallId) {
          // Disable automation after fallback call
          sheet.getRange(rowIndex, CONFIG.COLUMNS.MAKE_CALL + 1).setValue(false);
          console.log(`Row ${rowIndex}: Fallback call made, ID: ${newCallId}, automation disabled`);
        }
      }
      return;
    }

    // Counter > 2, should not happen but disable automation
    if (declineCounter > 2) {
      sheet.getRange(rowIndex, CONFIG.COLUMNS.MAKE_CALL + 1).setValue(false);
      console.log(`Row ${rowIndex}: Counter > 2, disabling automation`);
    }

  } catch (error) {
    console.error(`Error processing row ${rowIndex}:`, error);
  }
}

/**
 * Authenticate with ServiceTrade API and get auth token
 */
function authenticateServiceTrade() {
  try {
    console.log('[SERVICETRADE] Authenticating...');

    // Get credentials from Script Properties or CONFIG
    const properties = PropertiesService.getScriptProperties();
    const username = properties.getProperty('SERVICETRADE_USERNAME') || CONFIG.SERVICETRADE.USERNAME;
    const password = properties.getProperty('SERVICETRADE_PASSWORD') || CONFIG.SERVICETRADE.PASSWORD;

    const payload = {
      username: username,
      password: password
    };

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload)
    };

    const response = UrlFetchApp.fetch(CONFIG.SERVICETRADE.AUTH_URL, options);
    const responseData = JSON.parse(response.getContentText());

    if (response.getResponseCode() === 200 && responseData.data && responseData.data.authToken) {
      console.log('[SERVICETRADE] Authentication successful');
      return responseData.data.authToken;
    } else {
      console.error('[SERVICETRADE] Authentication failed:', responseData);
      return null;
    }

  } catch (error) {
    console.error('[SERVICETRADE] Authentication error:', error);
    return null;
  }
}

/**
 * Get fallback phone number from ServiceTrade API
 */
function getFallbackNumber() {
  try {
    console.log('[SERVICETRADE] Getting fallback number...');

    // First authenticate
    const authToken = authenticateServiceTrade();
    if (!authToken) {
      console.log('[SERVICETRADE] Using default fallback number due to auth failure');
      return CONFIG.FALLBACK_NUMBER;
    }

    // Get fallback user from Script Properties or CONFIG
    const properties = PropertiesService.getScriptProperties();
    const fallbackUser = properties.getProperty('SERVICETRADE_FALLBACK_USER') || CONFIG.SERVICETRADE.FALLBACK_USER;

    // Encode the user name for URL
    const encodedUserName = encodeURIComponent(fallbackUser);
    const userApiUrl = `${CONFIG.SERVICETRADE.USER_API_URL}?name=${encodedUserName}`;

    const options = {
      method: 'GET',
      headers: {
        'Cookie': `PHPSESSID=${authToken}`
      }
    };

    console.log(`[SERVICETRADE] Fetching user data for: ${fallbackUser}`);
    const response = UrlFetchApp.fetch(userApiUrl, options);
    const userData = JSON.parse(response.getContentText());

    if (response.getResponseCode() === 200 && userData.data && userData.data.users && userData.data.users.length > 0) {
      const user = userData.data.users[0];
      const phone = user.phone;

      if (phone) {
        const formattedPhone = formatPhoneNumber(phone);
        console.log(`[SERVICETRADE] Found fallback number: ${phone} -> ${formattedPhone}`);
        return formattedPhone;
      } else {
        console.log('[SERVICETRADE] No phone found for user, using default');
        return CONFIG.FALLBACK_NUMBER;
      }
    } else {
      console.error('[SERVICETRADE] User lookup failed:', userData);
      return CONFIG.FALLBACK_NUMBER;
    }

  } catch (error) {
    console.error('[SERVICETRADE] Error getting fallback number:', error);
    return CONFIG.FALLBACK_NUMBER;
  }
}

/**
 * Format phone number to +1XXXXXXXXXX format
 * Handles various input formats: 206-338-5620, 12063385620, 1-206-338-5620, 2063385620
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
      // Get dynamic fallback number from ServiceTrade API
      rawToNumber = getFallbackNumber();
    } else {
      // Use tech phone or get dynamic fallback as backup
      rawToNumber = rowData[CONFIG.COLUMNS.TECH_PHONE] || getFallbackNumber();
    }

    const toNumber = formatPhoneNumber(rawToNumber);
    const transferNumber = formatPhoneNumber(rowData[CONFIG.COLUMNS.FROM_NUMBER]);

    console.log(`Raw tech phone: '${rawToNumber}' -> Formatted: '${toNumber}'`);
    console.log(`Raw from number: '${rowData[CONFIG.COLUMNS.FROM_NUMBER]}' -> Formatted: '${transferNumber}'`);

    const payload = {
      from_number: CONFIG.FROM_NUMBER, // This should already be in correct format
      to_number: toNumber,
      override_agent_id: CONFIG.AGENT_ID,
      retell_llm_dynamic_variables: {
        customer_name: String(rowData[CONFIG.COLUMNS.CUSTOMER_NAME] || ''),
        customer_address: String(rowData[CONFIG.COLUMNS.SERVICE_ADDRESS] || ''),
        transcript: String(rowData[CONFIG.COLUMNS.TRANSCRIPT] || ''),
        call_summary: String(rowData[CONFIG.COLUMNS.CALL_SUMMARY] || ''),
        transfer_number: transferNumber
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
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);

    // Set up Script Properties for sensitive data (optional - can use CONFIG directly)
    const properties = PropertiesService.getScriptProperties();
    properties.setProperties({
      'SERVICETRADE_USERNAME': CONFIG.SERVICETRADE.USERNAME,
      'SERVICETRADE_PASSWORD': CONFIG.SERVICETRADE.PASSWORD,
      'SERVICETRADE_FALLBACK_USER': CONFIG.SERVICETRADE.FALLBACK_USER
    });

    // Add new column headers
    sheet.getRange(1, CONFIG.COLUMNS.MAKE_CALL + 1).setValue('make_call');
    sheet.getRange(1, CONFIG.COLUMNS.RESPONSE_CALL_ID_1 + 1).setValue('response_call_id_1');
    sheet.getRange(1, CONFIG.COLUMNS.RESPONSE_CALL_ID_2 + 1).setValue('response_call_id_2');
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

    console.log('Call automation setup complete!');
    console.log('IMPORTANT: Update your webhook to append rows at the bottom instead of inserting at position 2');

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
 * Debug function to check current column values
 */
function debugRowValues() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
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
    console.log(`  Make Call: '${rowData[CONFIG.COLUMNS.MAKE_CALL]}' (type: ${typeof rowData[CONFIG.COLUMNS.MAKE_CALL]})`);
    console.log(`  Tech Phone: '${rowData[CONFIG.COLUMNS.TECH_PHONE]}'`);
    console.log('---');
  }
}

/**
 * Helper function to set emergency values for testing
 */
function setEmergencyForTesting() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    console.log('No data rows found');
    return;
  }

  // Set the first data row as emergency for testing
  const rowToTest = 2; // First data row

  // Set make_call = true
  sheet.getRange(rowToTest, CONFIG.COLUMNS.MAKE_CALL + 1).setValue(true);

  // Set is_emergency = true
  sheet.getRange(rowToTest, CONFIG.COLUMNS.IS_EMERGENCY + 1).setValue(true);

  // Reset counters
  sheet.getRange(rowToTest, CONFIG.COLUMNS.RESPONSE_CALL_ID_1 + 1).setValue('');
  sheet.getRange(rowToTest, CONFIG.COLUMNS.RESPONSE_CALL_ID_2 + 1).setValue('');
  sheet.getRange(rowToTest, CONFIG.COLUMNS.CALL_DECLINE_COUNTER + 1).setValue(0);

  console.log(`Set row ${rowToTest} as emergency for testing`);
  console.log('Now run processCallAutomation() to test');
}

/**
 * Test phone number formatting function
 */
function testPhoneFormatting() {
  const testNumbers = [
    '206-338-5620',
    '12063385620',
    '1-206-338-5620',
    '2063385620',
    '+12063385620',
    '206.338.5620',
    '(206) 338-5620',
    '206 338 5620'
  ];

  console.log('=== PHONE NUMBER FORMATTING TEST ===');
  testNumbers.forEach(number => {
    const formatted = formatPhoneNumber(number);
    console.log(`'${number}' -> '${formatted}'`);
  });
}

/**
 * Test ServiceTrade API integration
 */
function testServiceTradeAPI() {
  console.log('=== SERVICETRADE API TEST ===');

  // Test authentication
  console.log('Testing authentication...');
  const authToken = authenticateServiceTrade();
  console.log(`Auth token: ${authToken ? 'SUCCESS' : 'FAILED'}`);

  if (authToken) {
    // Test fallback number lookup
    console.log('Testing fallback number lookup...');
    const fallbackNumber = getFallbackNumber();
    console.log(`Fallback number: ${fallbackNumber}`);
  }

  console.log('=== TEST COMPLETED ===');
}