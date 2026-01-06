/**
 * Plumbing/HVAC Call Automation System (v2)
 * 
 * This script automates outbound calls using Retell AI for plumbing and HVAC emergencies.
 * It fetches tech assignments from plumbing and HVAC APIs and makes calls to customers.
 * 
 * APIs Used:
 * - Plumbing: https://plumbing-api.vercel.app/api/assignments
 * - HVAC: https://hvacapi.vercel.app/api/assignments
 * 
 * Retell API Key: key_7ce8770efa1425b90a43322611e4
 * Google Sheets: https://docs.google.com/spreadsheets/d/1cbdvP5c-6QgZYsaXvVeTOD4VlYPKBV_yccY-lI8UFa0/edit?usp=sharing
 */

const RETELL_API_KEY = 'key_7ce8770efa1425b90a43322611e4';
const RETELL_BASE_URL = 'https://api.retellai.com/v2';

// Phone number and agent configuration
const FROM_NUMBER = '+17207308133';
const AGENT_ID = 'agent_b6f1a61cec8749a1f64121cad5';

// API endpoints for fetching tech assignments
const PLUMBING_API = 'https://plumbing-api.vercel.app/api/assignments';
const HVAC_API = 'https://hvacapi.vercel.app/api/assignments';

// Webhook URL for call analysis
const WEBHOOK_URL = 'https://vercel-webhook-nkoci60h7-mahees-projects-2df6704a.vercel.app/api/sheets3';

/**
 * Fetch tech assignments from both APIs
 */
async function fetchTechAssignments() {
    console.log('Fetching tech assignments from both APIs...');
    
    const results = {
        plumbing: { assignments: [], error: null },
        hvac: { assignments: [], error: null }
    };
    
    // Fetch from Plumbing API
    try {
        const plumbingResponse = await fetch(PLUMBING_API);
        if (plumbingResponse.ok) {
            const plumbingData = await plumbingResponse.json();
            results.plumbing.assignments = plumbingData.assignments || [];
            console.log(`Plumbing API: Found ${results.plumbing.assignments.length} assignments`);
        } else {
            results.plumbing.error = `HTTP ${plumbingResponse.status}`;
        }
    } catch (error) {
        results.plumbing.error = error.message;
        console.error('Plumbing API error:', error);
    }
    
    // Fetch from HVAC API
    try {
        const hvacResponse = await fetch(HVAC_API);
        if (hvacResponse.ok) {
            const hvacData = await hvacResponse.json();
            results.hvac.assignments = hvacData.assignments || [];
            console.log(`HVAC API: Found ${results.hvac.assignments.length} assignments`);
        } else {
            results.hvac.error = `HTTP ${hvacResponse.status}`;
        }
    } catch (error) {
        results.hvac.error = error.message;
        console.error('HVAC API error:', error);
    }
    
    return results;
}

/**
 * Create a phone call using Retell AI
 */
async function createCall(phoneNumber, customerInfo, emergencyType) {
    console.log(`Creating call to ${phoneNumber} for ${emergencyType} emergency`);
    
    const callData = {
        from_number: FROM_NUMBER,
        to_number: phoneNumber,
        override_agent_id: AGENT_ID,
        retell_llm_dynamic_variables: {
            customer_name: customerInfo.customerName || 'Unknown',
            service_address: customerInfo.serviceAddress || 'Unknown',
            emergency_type: emergencyType,
            call_purpose: 'emergency_notification',
            tech_name: customerInfo.techName || '',
            tech_phone: customerInfo.techPhone || '',
            tech_email: customerInfo.techEmail || '',
            appointment_id: customerInfo.appointmentId || '',
            job_name: customerInfo.jobName || ''
        }
    };
    
    try {
        const response = await fetch(`${RETELL_BASE_URL}/create-phone-call`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RETELL_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(callData)
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log(`Call created successfully: ${result.call_id}`);
            return { success: true, call_id: result.call_id };
        } else {
            const error = await response.text();
            console.error(`Failed to create call: ${response.status} - ${error}`);
            return { success: false, error: `HTTP ${response.status}: ${error}` };
        }
    } catch (error) {
        console.error('Error creating call:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Process assignments and make calls
 */
async function processAssignments(assignments, emergencyType) {
    console.log(`Processing ${assignments.length} ${emergencyType} assignments`);
    
    const callResults = [];
    
    for (const assignment of assignments) {
        const { appointmentId, jobName, techs } = assignment;
        
        console.log(`Processing assignment ${appointmentId}: ${jobName}`);
        
        // Find a tech with a phone number
        const availableTech = techs.find(tech => tech.phone && tech.phone !== 'null');
        
        if (!availableTech) {
            console.log(`No available tech with phone number for assignment ${appointmentId}`);
            continue;
        }
        
        // Prepare customer info (you might need to fetch this from another source)
        const customerInfo = {
            customerName: 'Emergency Customer', // You'll need to get this from your system
            serviceAddress: 'Service Location', // You'll need to get this from your system
            appointmentId: appointmentId,
            jobName: jobName,
            techName: availableTech.name,
            techPhone: availableTech.phone,
            techEmail: availableTech.email
        };
        
        // For demo purposes, we'll call the tech's phone number
        // In production, you'd call the customer's phone number
        const phoneToCall = availableTech.phone;
        
        const callResult = await createCall(phoneToCall, customerInfo, emergencyType);
        
        callResults.push({
            appointmentId,
            jobName,
            techName: availableTech.name,
            phoneNumber: phoneToCall,
            emergencyType,
            callResult
        });
        
        // Add delay between calls to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    return callResults;
}

/**
 * Main function to run the call automation
 */
async function runCallAutomation() {
    console.log('Starting Plumbing/HVAC Call Automation System v2');
    console.log('='.repeat(60));
    
    try {
        // Fetch assignments from both APIs
        const techAssignments = await fetchTechAssignments();
        
        const allCallResults = [];
        
        // Process Plumbing assignments
        if (techAssignments.plumbing.assignments.length > 0) {
            console.log('\\nProcessing Plumbing assignments...');
            const plumbingCalls = await processAssignments(
                techAssignments.plumbing.assignments, 
                'Plumbing'
            );
            allCallResults.push(...plumbingCalls);
        } else {
            console.log('No Plumbing assignments found');
            if (techAssignments.plumbing.error) {
                console.log(`Plumbing API error: ${techAssignments.plumbing.error}`);
            }
        }
        
        // Process HVAC assignments
        if (techAssignments.hvac.assignments.length > 0) {
            console.log('\\nProcessing HVAC assignments...');
            const hvacCalls = await processAssignments(
                techAssignments.hvac.assignments, 
                'HVAC'
            );
            allCallResults.push(...hvacCalls);
        } else {
            console.log('No HVAC assignments found');
            if (techAssignments.hvac.error) {
                console.log(`HVAC API error: ${techAssignments.hvac.error}`);
            }
        }
        
        // Summary
        console.log('\\n' + '='.repeat(60));
        console.log('CALL AUTOMATION SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total calls attempted: ${allCallResults.length}`);
        
        const successfulCalls = allCallResults.filter(result => result.callResult.success);
        const failedCalls = allCallResults.filter(result => !result.callResult.success);
        
        console.log(`Successful calls: ${successfulCalls.length}`);
        console.log(`Failed calls: ${failedCalls.length}`);
        
        if (successfulCalls.length > 0) {
            console.log('\\nSuccessful calls:');
            successfulCalls.forEach(call => {
                console.log(`  ✅ ${call.emergencyType}: ${call.techName} (${call.phoneNumber}) - Call ID: ${call.callResult.call_id}`);
            });
        }
        
        if (failedCalls.length > 0) {
            console.log('\\nFailed calls:');
            failedCalls.forEach(call => {
                console.log(`  ❌ ${call.emergencyType}: ${call.techName} (${call.phoneNumber}) - Error: ${call.callResult.error}`);
            });
        }
        
        return {
            success: true,
            totalCalls: allCallResults.length,
            successfulCalls: successfulCalls.length,
            failedCalls: failedCalls.length,
            results: allCallResults
        };
        
    } catch (error) {
        console.error('Error in call automation:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Test function to verify API connections
 */
async function testAPIs() {
    console.log('Testing API connections...');
    
    const techAssignments = await fetchTechAssignments();
    
    console.log('\\nPlumbing API Results:');
    if (techAssignments.plumbing.error) {
        console.log(`❌ Error: ${techAssignments.plumbing.error}`);
    } else {
        console.log(`✅ Success: ${techAssignments.plumbing.assignments.length} assignments`);
        if (techAssignments.plumbing.assignments.length > 0) {
            const firstAssignment = techAssignments.plumbing.assignments[0];
            console.log(`   Sample: ${firstAssignment.jobName}`);
            console.log(`   Techs: ${firstAssignment.techs.length}`);
        }
    }
    
    console.log('\\nHVAC API Results:');
    if (techAssignments.hvac.error) {
        console.log(`❌ Error: ${techAssignments.hvac.error}`);
    } else {
        console.log(`✅ Success: ${techAssignments.hvac.assignments.length} assignments`);
        if (techAssignments.hvac.assignments.length > 0) {
            const firstAssignment = techAssignments.hvac.assignments[0];
            console.log(`   Sample: ${firstAssignment.jobName}`);
            console.log(`   Techs: ${firstAssignment.techs.length}`);
        }
    }
}

/**
 * Setup function to configure webhook in Retell
 */
async function setupWebhook() {
    console.log('Setting up webhook in Retell...');
    
    const webhookData = {
        url: WEBHOOK_URL,
        events: ['call_analyzed']
    };
    
    try {
        const response = await fetch(`${RETELL_BASE_URL}/webhook`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RETELL_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(webhookData)
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('Webhook configured successfully:', result);
            return { success: true, webhook: result };
        } else {
            const error = await response.text();
            console.error(`Failed to setup webhook: ${response.status} - ${error}`);
            return { success: false, error: `HTTP ${response.status}: ${error}` };
        }
    } catch (error) {
        console.error('Error setting up webhook:', error);
        return { success: false, error: error.message };
    }
}

// Export functions for use in other modules or testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        runCallAutomation,
        testAPIs,
        setupWebhook,
        fetchTechAssignments,
        createCall,
        processAssignments
    };
}

// Auto-run if this script is executed directly
if (typeof window === 'undefined' && require.main === module) {
    runCallAutomation().then(result => {
        console.log('\\nAutomation completed:', result);
        process.exit(result.success ? 0 : 1);
    });
}