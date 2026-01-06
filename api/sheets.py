from http.server import BaseHTTPRequestHandler
import json
import os
from datetime import datetime
import urllib.request
import urllib.parse

def extract_variables(call_data):
    """
    Extract dynamic variables from Retell's call data
    Check multiple possible locations for the variables
    """
    variables = {
        'firstName': '',
        'lastName': '',
        'email': '',
        'description': '',
        'facilityName': '',
        'doctorName': '',
        'facilitynumber': '',
        'pickupLoc': '',
        'dropLocation': '',
        'appointmentDate': '',
        'tripdetails': ''
    }
    
    # Method 1: collected_dynamic_variables (from sample JSON)
    collected_vars = call_data.get('collected_dynamic_variables', {})
    if collected_vars and any(collected_vars.values()):
        for key in variables.keys():
            if key in collected_vars and collected_vars[key]:
                variables[key] = str(collected_vars[key])
        return variables
    
    # Method 2: Look in call_analysis.custom_analysis_data
    analysis = call_data.get('call_analysis', {})
    custom_data = analysis.get('custom_analysis_data', {})
    if custom_data and any(custom_data.values()):
        for key in variables.keys():
            if key in custom_data and custom_data[key]:
                variables[key] = str(custom_data[key])
        return variables
    
    # Method 3: Look for extract_variables tool call result in transcript_with_tool_calls
    transcript_with_tools = call_data.get('transcript_with_tool_calls', [])
    if transcript_with_tools:
        # Find extract_variables tool call
        extract_tool_id = None
        for entry in transcript_with_tools:
            if (entry.get('role') == 'tool_call_invocation' and 
                entry.get('name') == 'extract_variables'):
                extract_tool_id = entry.get('tool_call_id')
                break
        
        # Find the corresponding result
        if extract_tool_id:
            for entry in transcript_with_tools:
                if (entry.get('role') == 'tool_call_result' and 
                    entry.get('tool_call_id') == extract_tool_id):
                    content = entry.get('content', '')
                    if content:
                        try:
                            import json
                            result = json.loads(content)
                            if isinstance(result, dict):
                                # Check if variables are nested under 'variables' key
                                source_vars = result.get('variables', result)
                                for key in variables.keys():
                                    if key in source_vars and source_vars[key]:
                                        variables[key] = str(source_vars[key])
                                return variables
                        except (json.JSONDecodeError, TypeError):
                            continue
    
    # Method 4: Look for any tool_call_result with variables (broader search)
    if transcript_with_tools:
        for entry in transcript_with_tools:
            if entry.get('role') == 'tool_call_result':
                content = entry.get('content', '')
                if content:
                    try:
                        import json
                        result = json.loads(content)
                        if isinstance(result, dict):
                            # Check if this result contains our variable keys
                            found_vars = False
                            for key in variables.keys():
                                if key in result and result[key]:
                                    variables[key] = str(result[key])
                                    found_vars = True
                            if found_vars:
                                return variables
                    except (json.JSONDecodeError, TypeError):
                        continue
    
    # Method 5: Direct fields in call_data (last resort)
    for key in variables.keys():
        if key in call_data and call_data[key]:
            variables[key] = str(call_data[key])
    
    return variables

def send_to_google_sheets(call_data, extracted_vars, call_summary):
    """
    Send call analysis data to Google Sheets using Google Apps Script Web App
    """
    try:
        # You'll need to replace this with your Google Apps Script Web App URL
        sheets_url = os.environ.get('GOOGLE_SHEETS_URL', '')
        
        print(f"[SHEETS] Using URL: {sheets_url[:50]}..." if sheets_url else "[SHEETS] No URL set")
        
        if not sheets_url:
            print("[ERROR] GOOGLE_SHEETS_URL environment variable not set")
            return False
        
        # Prepare data for Google Sheets with your specific variables
        sheet_data = {
            'timestamp': datetime.now().isoformat(),
            'call_id': call_data.get('call_id', ''),
            'agent_name': call_data.get('agent_name', ''),
            'call_duration': call_data.get('duration_ms', 0),
            'call_cost': call_data.get('call_cost', {}).get('combined_cost', 0),
            'user_sentiment': call_data.get('call_analysis', {}).get('user_sentiment', ''),
            'call_successful': call_data.get('call_analysis', {}).get('call_successful', False),
            'call_summary': call_summary,
            # Your specific dynamic variables
            'firstName': extracted_vars.get('firstName', ''),
            'lastName': extracted_vars.get('lastName', ''),
            'email': extracted_vars.get('email', ''),
            'description': extracted_vars.get('description', ''),
            'facilityName': extracted_vars.get('facilityName', ''),
            'doctorName': extracted_vars.get('doctorName', ''),
            'facilitynumber': extracted_vars.get('facilitynumber', ''),
            'pickupLoc': extracted_vars.get('pickupLoc', ''),
            'dropLocation': extracted_vars.get('dropLocation', ''),
            'appointmentDate': extracted_vars.get('appointmentDate', ''),
            'tripdetails': extracted_vars.get('tripdetails', '')
        }
        
        # Log the data being sent for debugging
        print(f"[SHEETS] Data being sent to Google Sheets:")
        print(f"[SHEETS] firstName: '{sheet_data.get('firstName')}'")
        print(f"[SHEETS] lastName: '{sheet_data.get('lastName')}'")
        print(f"[SHEETS] email: '{sheet_data.get('email')}'")
        print(f"[SHEETS] description: '{sheet_data.get('description')}'")
        
        # Convert to JSON and encode
        data = json.dumps(sheet_data).encode('utf-8')
        
        # Create request
        req = urllib.request.Request(
            sheets_url,
            data=data,
            headers={'Content-Type': 'application/json'}
        )
        
        # Send request
        with urllib.request.urlopen(req, timeout=10) as response:
            result = response.read().decode('utf-8')
            print(f"[SHEETS] Data sent successfully: {result}")
            return True
            
    except Exception as e:
        print(f"[SHEETS ERROR] Failed to send data: {e}")
        return False

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        """Handle GET requests (health check)"""
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        response = {
            "message": "Google Sheets Integration API",
            "status": "healthy",
            "endpoints": {
                "POST /": "Process call analysis data and send to Google Sheets"
            }
        }
        self.wfile.write(json.dumps(response).encode())

    def do_POST(self):
        """Handle POST requests - process call analysis and send to Google Sheets"""
        try:
            # Read the request body
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length > 0:
                post_data = self.rfile.read(content_length)
                body = json.loads(post_data.decode('utf-8'))
            else:
                body = {}
            
            # Extract event information
            event_type = body.get("event", "unknown")
            call_data = body.get("call", {})
            call_id = call_data.get("call_id", "unknown")
            
            print(f"[SHEETS API] Received event: {event_type}, Call ID: {call_id}")
            
            # Only process call_analyzed events
            if event_type == "call_analyzed":
                analysis = call_data.get("call_analysis", {})
                call_summary = analysis.get("call_summary", "")
                transcript = call_data.get("transcript", "")
                
                print(f"[SHEETS API] Processing call analysis for {call_id}")
                
                # DETAILED DEBUGGING - Check payload structure
                print("=" * 60)
                print(f"DEBUG: ANALYZING CALL {call_id}")
                print(f"DEBUG: Call data keys: {list(call_data.keys())}")
                
                # Check Method 1: collected_dynamic_variables
                collected_vars = call_data.get('collected_dynamic_variables', {})
                print(f"DEBUG: collected_dynamic_variables exists: {bool(collected_vars)}")
                if collected_vars:
                    print(f"DEBUG: collected_dynamic_variables content: {collected_vars}")
                
                # Check Method 2: call_analysis.custom_analysis_data
                analysis = call_data.get('call_analysis', {})
                custom_data = analysis.get('custom_analysis_data', {})
                print(f"DEBUG: call_analysis keys: {list(analysis.keys())}")
                print(f"DEBUG: custom_analysis_data exists: {bool(custom_data)}")
                if custom_data:
                    print(f"DEBUG: custom_analysis_data content: {custom_data}")
                
                # Check Method 3: transcript_with_tool_calls
                transcript_tools = call_data.get('transcript_with_tool_calls', [])
                print(f"DEBUG: transcript_with_tool_calls length: {len(transcript_tools)}")
                
                # Look for tool calls
                tool_calls_found = []
                for i, entry in enumerate(transcript_tools):
                    if entry.get('role') == 'tool_call_invocation':
                        tool_name = entry.get('name', 'unknown')
                        tool_id = entry.get('tool_call_id', 'no_id')
                        tool_calls_found.append(f"{tool_name}({tool_id})")
                        print(f"DEBUG: Tool call {i}: {tool_name} with ID {tool_id}")
                
                print(f"DEBUG: All tool calls found: {tool_calls_found}")
                
                # Look for tool results
                tool_results_found = []
                for i, entry in enumerate(transcript_tools):
                    if entry.get('role') == 'tool_call_result':
                        tool_id = entry.get('tool_call_id', 'no_id')
                        content = entry.get('content', '')
                        tool_results_found.append(tool_id)
                        print(f"DEBUG: Tool result {i}: ID {tool_id}, content length: {len(content)}")
                        if content and len(content) < 500:  # Only show short content
                            print(f"DEBUG: Tool result content: {content}")
                
                print(f"DEBUG: All tool result IDs: {tool_results_found}")
                print("=" * 60)
                
                # Extract variables from Retell's call data
                extracted_vars = extract_variables(call_data)
                print(f"[SHEETS API] FINAL EXTRACTED VARIABLES: {extracted_vars}")
                
                # Log successful extractions
                non_empty_vars = {k: v for k, v in extracted_vars.items() if v}
                if non_empty_vars:
                    print(f"[SHEETS API] SUCCESS: Extracted {len(non_empty_vars)} variables: {non_empty_vars}")
                else:
                    print(f"[SHEETS API] ERROR: No variables extracted for call {call_id} - check payload structure above")
                
                # Send to Google Sheets
                success = send_to_google_sheets(call_data, extracted_vars, call_summary)
                
                if success:
                    response_data = {
                        "status": "success",
                        "message": "Data sent to Google Sheets",
                        "call_id": call_id,
                        "extracted_variables": extracted_vars
                    }
                    self.send_response(200)
                else:
                    response_data = {
                        "status": "error",
                        "message": "Failed to send data to Google Sheets",
                        "call_id": call_id
                    }
                    self.send_response(500)
                
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(response_data).encode())
                
            else:
                # Not a call_analyzed event, return success but no action
                response_data = {
                    "status": "ignored",
                    "message": f"Event type '{event_type}' not processed",
                    "call_id": call_id
                }
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(response_data).encode())
            
        except json.JSONDecodeError as e:
            print(f"[SHEETS API ERROR] Invalid JSON payload: {e}")
            self.send_response(400)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            error_response = {"error": "Invalid JSON payload"}
            self.wfile.write(json.dumps(error_response).encode())
            
        except Exception as e:
            print(f"[SHEETS API ERROR] Processing failed: {e}")
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            error_response = {"error": "Internal Server Error"}
            self.wfile.write(json.dumps(error_response).encode())

    def do_OPTIONS(self):
        """Handle OPTIONS requests (CORS preflight)"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()