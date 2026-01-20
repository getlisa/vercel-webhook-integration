from http.server import BaseHTTPRequestHandler
import json
import os
from datetime import datetime
import urllib.request
import urllib.parse

def extract_variables_v5(call_data):
    """
    Extract dynamic variables for the fifth webhook (EliteFire)
    Variables: fromNumber, customerName, serviceAddress, callSummary, email, recording_url
    """
    variables = {
        'fromNumber': '',
        'customerName': '',
        'serviceAddress': '',
        'callSummary': '',
        'email': '',
        'recording_url': ''
    }
    
    # Method 1: collected_dynamic_variables (primary location)
    collected_vars = call_data.get('collected_dynamic_variables', {})
    if collected_vars and any(collected_vars.values()):
        for key in ['fromNumber', 'customerName', 'serviceAddress', 'callSummary', 'email']:
            if key in collected_vars and collected_vars[key]:
                variables[key] = str(collected_vars[key])
        
        # Get recording_url directly from call_data (it's at root level)
        recording_url = call_data.get('recording_url', '')
        if recording_url:
            variables['recording_url'] = str(recording_url)
    
    # Method 2: Look in call_analysis.custom_analysis_data
    if not any(variables[k] for k in ['fromNumber', 'customerName', 'serviceAddress', 'callSummary']):
        analysis = call_data.get('call_analysis', {})
        custom_data = analysis.get('custom_analysis_data', {})
        if custom_data and any(custom_data.values()):
            for key in ['fromNumber', 'customerName', 'serviceAddress', 'callSummary', 'email']:
                if key in custom_data and custom_data[key]:
                    variables[key] = str(custom_data[key])
    
    # Method 3: Look for extract_variables tool call result in transcript_with_tool_calls
    if not any(variables[k] for k in ['fromNumber', 'customerName', 'serviceAddress', 'callSummary']):
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
                                result = json.loads(content)
                                if isinstance(result, dict):
                                    source_vars = result.get('variables', result)
                                    for key in ['fromNumber', 'customerName', 'serviceAddress', 'callSummary', 'email']:
                                        if key in source_vars and source_vars[key]:
                                            variables[key] = str(source_vars[key])
                                    break
                            except (json.JSONDecodeError, TypeError):
                                continue
    
    # Method 4: Look for any tool_call_result with variables (broader search)
    if not any(variables[k] for k in ['fromNumber', 'customerName', 'serviceAddress', 'callSummary']):
        transcript_with_tools = call_data.get('transcript_with_tool_calls', [])
        if transcript_with_tools:
            for entry in transcript_with_tools:
                if entry.get('role') == 'tool_call_result':
                    content = entry.get('content', '')
                    if content:
                        try:
                            result = json.loads(content)
                            if isinstance(result, dict):
                                found_vars = False
                                for key in ['fromNumber', 'customerName', 'serviceAddress', 'callSummary', 'email']:
                                    if key in result and result[key]:
                                        variables[key] = str(result[key])
                                        found_vars = True
                                if found_vars:
                                    break
                        except (json.JSONDecodeError, TypeError):
                            continue
    
    # Method 5: Direct fields in call_data (last resort)
    for key in ['fromNumber', 'customerName', 'serviceAddress', 'callSummary', 'email']:
        if not variables[key] and key in call_data and call_data[key]:
            variables[key] = str(call_data[key])
    
    return variables

def get_email_from_api_v5():
    """
    Get email from the EliteFire API endpoint
    Uses the EliteFire API endpoint
    """
    try:
        api_url = "https://elitefire-dwa7rawf3-mahees-projects-2df6704a.vercel.app/api/assignments"
        
        with urllib.request.urlopen(api_url, timeout=10) as response:
            data = response.read().decode('utf-8')
            
            try:
                json_data = json.loads(data)
                print(f"[EMAIL API V5] Received data: {json_data}")
                
                # Check if assignments exist and is not empty
                assignments = json_data.get('assignments', [])
                
                if not assignments:
                    print("[EMAIL API V5] Case 1: No assignments found")
                    return ''
                
                # Look through assignments for techs with emails
                for assignment in assignments:
                    techs = assignment.get('techs', [])
                    for tech in techs:
                        if tech and tech.get('email'):
                            email = tech['email']
                            print(f"[EMAIL API V5] Found email: {email}")
                            return email
                
                print("[EMAIL API V5] No valid email found in assignments")
                return ''
                
            except json.JSONDecodeError as e:
                print(f"[EMAIL API V5 ERROR] Failed to parse JSON: {e}")
                # If not JSON, check if the response itself is an email
                if '@' in data and '.' in data:
                    return data.strip()
                return ''
                
    except Exception as e:
        print(f"[EMAIL API V5 ERROR] Failed to fetch email: {e}")
        return ''

def send_to_google_sheets_v5(call_data, extracted_vars, call_summary):
    """
    Send call analysis data to the fifth Google Sheets using Google Apps Script Web App (EliteFire)
    """
    try:
        # Use the fifth Google Sheets URL (will be set as environment variable)
        sheets_url = os.environ.get('GOOGLE_SHEETS_URL_5', '')
        
        print(f"[SHEETS5] Using URL: {sheets_url[:50]}..." if sheets_url else "[SHEETS5] No URL set")
        
        if not sheets_url:
            print("[ERROR] GOOGLE_SHEETS_URL_5 environment variable not set")
            return False
        
        # Get email from external API
        email_from_api = get_email_from_api_v5()
        print(f"[SHEETS5] Email from API: {email_from_api}")
        
        # Prepare data for Google Sheets with the new variables
        sheet_data = {
            'timestamp': datetime.now().isoformat(),
            'call_id': call_data.get('call_id', ''),
            'agent_name': call_data.get('agent_name', ''),
            'call_duration': call_data.get('duration_ms', 0),
            'call_cost': call_data.get('call_cost', {}).get('combined_cost', 0),
            'user_sentiment': call_data.get('call_analysis', {}).get('user_sentiment', ''),
            'call_successful': call_data.get('call_analysis', {}).get('call_successful', False),
            'call_summary': call_summary,
            # Variables for this webhook (same as v2 plus recording_url)
            'fromNumber': extracted_vars.get('fromNumber', ''),
            'customerName': extracted_vars.get('customerName', ''),
            'serviceAddress': extracted_vars.get('serviceAddress', ''),
            'callSummary': extracted_vars.get('callSummary', call_summary),  # Fallback to call_summary
            'email': email_from_api or extracted_vars.get('email', ''),  # Prefer API email
            'recording_url': extracted_vars.get('recording_url', '')  # New variable
        }
        
        # Log the data being sent for debugging
        print(f"[SHEETS5] Data being sent:")
        print(f"[SHEETS5] fromNumber: '{sheet_data.get('fromNumber')}'")
        print(f"[SHEETS5] customerName: '{sheet_data.get('customerName')}'")
        print(f"[SHEETS5] serviceAddress: '{sheet_data.get('serviceAddress')}'")
        print(f"[SHEETS5] email: '{sheet_data.get('email')}'")
        print(f"[SHEETS5] recording_url: '{sheet_data.get('recording_url')}'")
        
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
            print(f"[SHEETS5] Data sent successfully: {result}")
            return True
            
    except Exception as e:
        print(f"[SHEETS5 ERROR] Failed to send data: {e}")
        return False

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        """Handle GET requests (health check)"""
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        response = {
            "message": "Google Sheets Integration API v5 (EliteFire)",
            "status": "healthy",
            "variables": ["fromNumber", "customerName", "serviceAddress", "callSummary", "email", "recording_url"],
            "api_endpoint": "https://elitefire-dwa7rawf3-mahees-projects-2df6704a.vercel.app/api/assignments",
            "endpoints": {
                "POST /": "Process call analysis data and send to Google Sheets v5"
            }
        }
        self.wfile.write(json.dumps(response).encode())

    def do_POST(self):
        """Handle POST requests - process call analysis and send to Google Sheets v5"""
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
            
            print(f"[SHEETS5 API] Received event: {event_type}, Call ID: {call_id}")
            
            # Only process call_analyzed events
            if event_type == "call_analyzed":
                analysis = call_data.get("call_analysis", {})
                call_summary = analysis.get("call_summary", "")
                
                print(f"[SHEETS5 API] Processing call analysis for {call_id}")
                
                # DETAILED DEBUGGING - Check payload structure
                print("=" * 60)
                print(f"DEBUG V5: ANALYZING CALL {call_id}")
                print(f"DEBUG V5: Call data keys: {list(call_data.keys())}")
                
                # Check for collected_dynamic_variables
                collected_vars = call_data.get('collected_dynamic_variables', {})
                print(f"DEBUG V5: collected_dynamic_variables exists: {bool(collected_vars)}")
                if collected_vars:
                    print(f"DEBUG V5: collected_dynamic_variables content: {collected_vars}")
                
                # Check for recording_url
                recording_url = call_data.get('recording_url', '')
                print(f"DEBUG V5: recording_url: {recording_url}")
                print("=" * 60)
                
                # Extract variables from Retell's call data
                extracted_vars = extract_variables_v5(call_data)
                print(f"[SHEETS5 API] FINAL EXTRACTED VARIABLES: {extracted_vars}")
                
                # Log successful extractions
                non_empty_vars = {k: v for k, v in extracted_vars.items() if v}
                if non_empty_vars:
                    print(f"[SHEETS5 API] SUCCESS: Extracted {len(non_empty_vars)} variables: {non_empty_vars}")
                else:
                    print(f"[SHEETS5 API] ERROR: No variables extracted for call {call_id}")
                
                # Send to Google Sheets
                success = send_to_google_sheets_v5(call_data, extracted_vars, call_summary)
                
                if success:
                    response_data = {
                        "status": "success",
                        "message": "Data sent to Google Sheets v5 (EliteFire)",
                        "call_id": call_id,
                        "extracted_variables": extracted_vars
                    }
                    self.send_response(200)
                else:
                    response_data = {
                        "status": "error",
                        "message": "Failed to send data to Google Sheets v5",
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
            print(f"[SHEETS5 API ERROR] Invalid JSON payload: {e}")
            self.send_response(400)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            error_response = {"error": "Invalid JSON payload"}
            self.wfile.write(json.dumps(error_response).encode())
            
        except Exception as e:
            print(f"[SHEETS5 API ERROR] Processing failed: {e}")
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
