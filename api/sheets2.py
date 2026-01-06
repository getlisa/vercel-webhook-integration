from http.server import BaseHTTPRequestHandler
import json
import os
from datetime import datetime
import urllib.request
import urllib.parse
import ssl
import hashlib

# Simple file-based deduplication to persist across serverless invocations
PROCESSED_CALLS_FILE = '/tmp/processed_calls_sheets2.json'

def extract_variables_v2(call_data):
    """
    Extract dynamic variables for the second webhook
    Variables: fromNumber, customerName, serviceAddress, callSummary, email, isitEmergency, emergencyType
    """
    variables = {
        'fromNumber': '',
        'customerName': '',
        'serviceAddress': '',
        'callSummary': '',
        'email': '',
        'isitEmergency': '',
        'emergencyType': ''
    }
    
    # Method 1: collected_dynamic_variables (primary location)
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
                            result = json.loads(content)
                            if isinstance(result, dict):
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
                        result = json.loads(content)
                        if isinstance(result, dict):
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

def get_tech_data_from_api(emergency_type=''):
    """
    Get tech data (email and phone) from the external API endpoints based on emergency type
    Priority based on emergencyType:
    - If emergencyType is 'Sprinkler': Try sprinkler API first, then fire-alarm as fallback
    - If emergencyType is 'Fire Alarm' or empty: Try fire-alarm API first, then sprinkler as fallback
    
    Args:
        emergency_type (str): The type of emergency ('Sprinkler', 'Fire Alarm', etc.)
    
    Returns: dict with 'email' and 'phone' keys
    """
    
    def try_api_endpoint(api_url, api_name):
        """Helper function to try a single API endpoint and return email and phone"""
        try:
            print(f"[{api_name}] Trying API: {api_url}")
            
            # Create SSL context that doesn't verify certificates (for Vercel environment)
            ssl_context = ssl.create_default_context()
            ssl_context.check_hostname = False
            ssl_context.verify_mode = ssl.CERT_NONE
            
            with urllib.request.urlopen(api_url, timeout=10, context=ssl_context) as response:
                data = response.read().decode('utf-8')
                
                try:
                    json_data = json.loads(data)
                    print(f"[{api_name}] Received data: {json_data}")
                    
                    # Handle case where API returns null or non-dict
                    if not isinstance(json_data, dict):
                        print(f"[{api_name}] API returned non-dict data: {type(json_data)}")
                        return {'email': '', 'phone': ''}
                    
                    # Check if this is just a status message
                    if 'message' in json_data and 'status' in json_data:
                        print(f"[{api_name}] API returned status message: {json_data.get('message')}")
                        return {'email': '', 'phone': ''}
                    
                    # Check if assignments exist and is not empty
                    assignments = json_data.get('assignments', [])
                    
                    if not assignments or len(assignments) == 0:
                        print(f"[{api_name}] No assignments found - empty array")
                        return {'email': '', 'phone': ''}
                    
                    # Look through assignments for techs with emails and phones
                    for assignment in assignments:
                        if not assignment:  # Skip null assignments
                            continue
                            
                        techs = assignment.get('techs', [])
                        
                        if not techs or len(techs) == 0:
                            print(f"[{api_name}] No techs found in assignment")
                            continue
                        
                        for tech in techs:
                            if tech and isinstance(tech, dict) and (tech.get('email') or tech.get('phone')):
                                name = tech.get('name', '')
                                email = tech.get('email', '')
                                phone = tech.get('phone', '')
                                print(f"[{api_name}] Found - name: {name}, email: {email}, phone: {phone}")
                                return {'name': name, 'email': email, 'phone': phone}
                    
                    print(f"[{api_name}] No valid email or phone found in assignments")
                    return {'name': '', 'email': '', 'phone': ''}
                    
                except json.JSONDecodeError as e:
                    print(f"[{api_name} ERROR] Failed to parse JSON: {e}")
                    # If not JSON, check if the response itself is an email
                    if '@' in data and '.' in data:
                        email = data.strip()
                        print(f"[{api_name}] Found direct email: {email}")
                        return {'name': '', 'email': email, 'phone': ''}
                    return {'name': '', 'email': '', 'phone': ''}
                    
        except Exception as e:
            print(f"[{api_name} ERROR] Failed to fetch data: {e}")
            return {'name': '', 'email': '', 'phone': ''}
    
    try:
        # Define API endpoints
        fire_alarm_api = "https://fire-alarm-men6qqx0l-mahees-projects-2df6704a.vercel.app/api/assignments"
        sprinkler_api = "https://sprinkler-p52oxcmyy-mahees-projects-2df6704a.vercel.app/api/assignments"
        
        # Determine API priority based on emergency type
        if emergency_type == 'Sprinkler':
            primary_api = sprinkler_api
            primary_name = "SPRINKLER API"
            fallback_api = fire_alarm_api
            fallback_name = "FIRE ALARM API"
            print(f"[API] Emergency type is 'Sprinkler' - trying Sprinkler API first")
        elif emergency_type == 'Fire Alarm':
            primary_api = fire_alarm_api
            primary_name = "FIRE ALARM API"
            fallback_api = sprinkler_api
            fallback_name = "SPRINKLER API"
            print(f"[API] Emergency type is 'Fire Alarm' - trying Fire Alarm API first")
        else:
            # Default to Fire Alarm API for empty or unknown emergency types
            primary_api = fire_alarm_api
            primary_name = "FIRE ALARM API"
            fallback_api = sprinkler_api
            fallback_name = "SPRINKLER API"
            print(f"[API] Emergency type is '{emergency_type}' (unknown/empty) - defaulting to Fire Alarm API first")
        
        # Try primary API first
        result = try_api_endpoint(primary_api, primary_name)
        
        # Ensure result is a dict
        if not isinstance(result, dict):
            result = {'name': '', 'email': '', 'phone': ''}
        
        if result.get('email') or result.get('phone'):
            print(f"[API] SUCCESS: Got data from {primary_name} - name: {result.get('name', '')}, email: {result.get('email', '')}, phone: {result.get('phone', '')}")
            return result
        
        # If no data from primary, try fallback API
        print(f"[API] No data from {primary_name}, trying {fallback_name}...")
        result = try_api_endpoint(fallback_api, fallback_name)
        
        # Ensure result is a dict
        if not isinstance(result, dict):
            result = {'name': '', 'email': '', 'phone': ''}
        
        if result.get('email') or result.get('phone'):
            print(f"[API] SUCCESS: Got data from {fallback_name} - name: {result.get('name', '')}, email: {result.get('email', '')}, phone: {result.get('phone', '')}")
            return result
        
        print("[API] No email or phone found from either API")
        
        # Fallback to environment variables if APIs don't have data
        fallback_email = os.environ.get('FALLBACK_TECH_EMAIL', '')
        fallback_phone = os.environ.get('FALLBACK_TECH_PHONE', '')
        
        if fallback_email or fallback_phone:
            print(f"[API] Using fallback data - email: {fallback_email}, phone: {fallback_phone}")
            return {'name': '', 'email': fallback_email, 'phone': fallback_phone}
        
        return {'name': '', 'email': '', 'phone': ''}
        
    except Exception as e:
        print(f"[API ERROR] Exception in get_tech_data_from_api: {e}")
        
        # Fallback to environment variables on error
        fallback_email = os.environ.get('FALLBACK_TECH_EMAIL', '')
        fallback_phone = os.environ.get('FALLBACK_TECH_PHONE', '')
        
        if fallback_email or fallback_phone:
            print(f"[API] Using fallback data after error - email: {fallback_email}, phone: {fallback_phone}")
            return {'name': '', 'email': fallback_email, 'phone': fallback_phone}
        
        return {'name': '', 'email': '', 'phone': ''}

def send_to_google_sheets_v2(call_data, extracted_vars, call_summary, tech_data):
    """
    Send call analysis data to the second Google Sheets using Google Apps Script Web App
    """
    try:
        # Use the second Google Sheets URL (will be set as environment variable)
        sheets_url = os.environ.get('GOOGLE_SHEETS_URL_2', '')
        
        print(f"[SHEETS2] Using URL: {sheets_url[:50]}..." if sheets_url else "[SHEETS2] No URL set")
        
        if not sheets_url:
            print("[ERROR] GOOGLE_SHEETS_URL_2 environment variable not set")
            return False
        
        # Get transcript
        transcript = call_data.get('transcript', '')
        
        # Prepare data for Google Sheets with the new variables
        sheet_data = {
            'timestamp': datetime.now().isoformat(),
            'call_id': call_data.get('call_id', ''),
            'agent_name': call_data.get('agent_name', ''),
            'call_duration': call_data.get('duration_ms', 0),
            'user_sentiment': call_data.get('call_analysis', {}).get('user_sentiment', ''),
            'call_successful': call_data.get('call_analysis', {}).get('call_successful', False),
            'call_summary': call_summary,
            'transcript': transcript,
            # New variables for this webhook
            'fromNumber': extracted_vars.get('fromNumber', ''),
            'customerName': extracted_vars.get('customerName', ''),
            'serviceAddress': extracted_vars.get('serviceAddress', ''),
            'callSummary': extracted_vars.get('callSummary', call_summary),  # Fallback to call_summary
            'email': tech_data.get('email', '') or extracted_vars.get('email', ''),  # Prefer API email
            'phone': tech_data.get('phone', ''),  # Tech phone from API
            # Emergency variables
            'isitEmergency': extracted_vars.get('isitEmergency', ''),
            'emergencyType': extracted_vars.get('emergencyType', '')
        }
        
        # Log the data being sent for debugging
        print(f"[SHEETS2] Data being sent:")
        print(f"[SHEETS2] fromNumber: '{sheet_data.get('fromNumber')}'")
        print(f"[SHEETS2] customerName: '{sheet_data.get('customerName')}'")
        print(f"[SHEETS2] serviceAddress: '{sheet_data.get('serviceAddress')}'")
        print(f"[SHEETS2] email: '{sheet_data.get('email')}'")
        print(f"[SHEETS2] phone: '{sheet_data.get('phone')}'")
        print(f"[SHEETS2] Tech data used - email: '{tech_data.get('email', '')}', phone: '{tech_data.get('phone', '')}'")
        
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
            print(f"[SHEETS2] Data sent successfully: {result}")
            return True
            
    except Exception as e:
        print(f"[SHEETS2 ERROR] Failed to send data: {e}")
        return False

class handler(BaseHTTPRequestHandler):
    def is_duplicate_call(self, call_data):
        """Check if this call has already been processed using content hash"""
        try:
            # Create a hash of the relevant call data
            call_id = call_data.get('call_id', '')
            call_analysis = call_data.get('call_analysis', {})
            custom_data = call_analysis.get('custom_analysis_data', {})
            collected_vars = call_data.get('collected_dynamic_variables', {})
            
            # Create hash from call_id + variables + timestamp (rounded to minute)
            hash_content = {
                'call_id': call_id,
                'custom_data': str(custom_data),
                'collected_vars': str(collected_vars),
                'timestamp_minute': int(call_data.get('start_timestamp', 0) / 60000)  # Round to minute
            }
            
            content_hash = hashlib.md5(json.dumps(hash_content, sort_keys=True).encode()).hexdigest()
            
            # Load processed calls
            processed_calls = self.load_processed_calls()
            
            # Check if already processed
            if content_hash in processed_calls:
                print(f"[SHEETS2] Found duplicate hash: {content_hash}")
                return True
            
            # Mark as processed
            processed_calls[content_hash] = {
                'call_id': call_id,
                'processed_at': datetime.now().isoformat(),
                'timestamp': call_data.get('start_timestamp', 0)
            }
            
            # Clean old entries (keep only last 1000 and last 24 hours)
            self.cleanup_processed_calls(processed_calls)
            
            # Save updated list
            self.save_processed_calls(processed_calls)
            
            print(f"[SHEETS2] New call hash: {content_hash}")
            return False
            
        except Exception as e:
            print(f"[SHEETS2 ERROR] Error checking duplicate: {e}")
            return False  # If error, allow processing to continue

    def load_processed_calls(self):
        """Load processed calls from file"""
        try:
            if os.path.exists(PROCESSED_CALLS_FILE):
                with open(PROCESSED_CALLS_FILE, 'r') as f:
                    return json.load(f)
        except Exception as e:
            print(f"[SHEETS2 ERROR] Error loading processed calls: {e}")
        return {}

    def save_processed_calls(self, processed_calls):
        """Save processed calls to file"""
        try:
            with open(PROCESSED_CALLS_FILE, 'w') as f:
                json.dump(processed_calls, f)
        except Exception as e:
            print(f"[SHEETS2 ERROR] Error saving processed calls: {e}")

    def cleanup_processed_calls(self, processed_calls):
        """Clean up old processed calls to prevent file from growing too large"""
        try:
            current_time = datetime.now()
            cutoff_time = current_time.timestamp() - (24 * 60 * 60 * 1000)  # 24 hours ago in milliseconds
            
            # Remove entries older than 24 hours
            to_remove = []
            for hash_key, data in processed_calls.items():
                if data.get('timestamp', 0) < cutoff_time:
                    to_remove.append(hash_key)
            
            for key in to_remove:
                del processed_calls[key]
            
            # Keep only the most recent 1000 entries
            if len(processed_calls) > 1000:
                sorted_items = sorted(processed_calls.items(), 
                                    key=lambda x: x[1].get('timestamp', 0), 
                                    reverse=True)
                processed_calls.clear()
                processed_calls.update(dict(sorted_items[:1000]))
                
            print(f"[SHEETS2] Cleaned up processed calls, {len(processed_calls)} entries remaining")
            
        except Exception as e:
            print(f"[SHEETS2 ERROR] Error cleaning up processed calls: {e}")

    def do_GET(self):
        """Handle GET requests (health check)"""
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        response = {
            "message": "Google Sheets Integration API v2",
            "status": "healthy",
            "variables": ["fromNumber", "customerName", "serviceAddress", "callSummary", "email"],
            "endpoints": {
                "POST /": "Process call analysis data and send to Google Sheets v2"
            }
        }
        self.wfile.write(json.dumps(response).encode())

    def do_POST(self):
        """Handle POST requests - process call analysis and send to Google Sheets v2"""
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
            
            print(f"[SHEETS2 API] Received event: {event_type}, Call ID: {call_id}")
            
            # Only process call_analyzed events
            if event_type == "call_analyzed":
                # Check for duplicate processing
                if self.is_duplicate_call(call_data):
                    print(f"[SHEETS2] Duplicate call detected, skipping processing for {call_id}")
                    response_data = {
                        "status": "skipped",
                        "message": "Duplicate call ignored",
                        "call_id": call_id
                    }
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps(response_data).encode())
                    return
                
                analysis = call_data.get("call_analysis", {})
                call_summary = analysis.get("call_summary", "")
                
                print(f"[SHEETS2 API] Processing new call analysis for {call_id}")
                
                # DETAILED DEBUGGING - Check payload structure
                print("=" * 60)
                print(f"DEBUG V2: ANALYZING CALL {call_id}")
                print(f"DEBUG V2: Call data keys: {list(call_data.keys())}")
                
                # Check for collected_dynamic_variables
                collected_vars = call_data.get('collected_dynamic_variables', {})
                print(f"DEBUG V2: collected_dynamic_variables exists: {bool(collected_vars)}")
                if collected_vars:
                    print(f"DEBUG V2: collected_dynamic_variables content: {collected_vars}")
                
                print("=" * 60)
                
                # Extract variables from Retell's call data
                extracted_vars = extract_variables_v2(call_data)
                print(f"[SHEETS2 API] FINAL EXTRACTED VARIABLES: {extracted_vars}")
                
                # Get tech data from external APIs based on emergency type
                try:
                    emergency_type = extracted_vars.get('emergencyType', '')
                    print(f"[SHEETS2] Emergency type detected: '{emergency_type}'")
                    print(f"[SHEETS2] Calling get_tech_data_from_api() with emergency_type='{emergency_type}'...")
                    tech_data = get_tech_data_from_api(emergency_type)
                    if not isinstance(tech_data, dict):
                        tech_data = {'name': '', 'email': '', 'phone': ''}
                    print(f"[SHEETS2] Tech data from API: {tech_data}")
                    print(f"[SHEETS2] Tech data name: '{tech_data.get('name', '')}'")
                    print(f"[SHEETS2] Tech data email: '{tech_data.get('email', '')}'")
                    print(f"[SHEETS2] Tech data phone: '{tech_data.get('phone', '')}'")
                except Exception as e:
                    print(f"[SHEETS2] Error getting tech data: {e}")
                    tech_data = {'name': '', 'email': '', 'phone': ''}
                
                # Log successful extractions
                non_empty_vars = {k: v for k, v in extracted_vars.items() if v}
                if non_empty_vars:
                    print(f"[SHEETS2 API] SUCCESS: Extracted {len(non_empty_vars)} variables: {non_empty_vars}")
                else:
                    print(f"[SHEETS2 API] ERROR: No variables extracted for call {call_id}")
                
                # Send to Google Sheets
                try:
                    success = send_to_google_sheets_v2(call_data, extracted_vars, call_summary, tech_data)
                    
                    if success:
                        response_data = {
                            "status": "success",
                            "message": "Data sent to Google Sheets v2",
                            "call_id": call_id,
                            "extracted_variables": extracted_vars,
                            "transcript": call_data.get('transcript', ''),
                            "tech_data": tech_data,
                            "call_metadata": {
                                "agent_name": call_data.get('agent_name', ''),
                                "duration_ms": call_data.get('duration_ms', 0),
                                "user_sentiment": call_data.get('call_analysis', {}).get('user_sentiment', ''),
                                "call_successful": call_data.get('call_analysis', {}).get('call_successful', False)
                            }
                        }
                        self.send_response(200)
                    else:
                        response_data = {
                            "status": "partial_success",
                            "message": "Data may have been sent to Google Sheets but response failed",
                            "call_id": call_id,
                            "extracted_variables": extracted_vars
                        }
                        self.send_response(200)  # Return 200 since data was likely saved
                        
                except Exception as e:
                    print(f"[SHEETS2 API ERROR] Exception in Google Sheets operation: {e}")
                    response_data = {
                        "status": "partial_success", 
                        "message": "Data processing completed but response generation failed",
                        "call_id": call_id,
                        "error": str(e)
                    }
                    self.send_response(200)  # Return 200 since the core operation likely succeeded
                
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
            print(f"[SHEETS2 API ERROR] Invalid JSON payload: {e}")
            self.send_response(400)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            error_response = {"error": "Invalid JSON payload"}
            self.wfile.write(json.dumps(error_response).encode())
            
        except Exception as e:
            print(f"[SHEETS2 API ERROR] Processing failed: {e}")
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