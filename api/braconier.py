from http.server import BaseHTTPRequestHandler
import json
import os
import time
from datetime import datetime
import urllib.request
import urllib.parse
import ssl
import hashlib

# Simple file-based deduplication to persist across serverless invocations
PROCESSED_CALLS_FILE = '/tmp/processed_calls_sheets3.json'

def normalize_phone_number(value):
    """Return a normalized E.164-like phone number when possible."""
    raw = str(value or '').strip()
    if not raw:
        return ''

    digits = ''.join(ch for ch in raw if ch.isdigit())
    if len(digits) == 10:
        return f'+1{digits}'
    if len(digits) == 11 and digits.startswith('1'):
        return f'+{digits}'
    if 11 <= len(digits) <= 15:
        return f'+{digits}'
    return ''

def pick_best_from_number(*candidates):
    """Prefer the first valid phone number, otherwise return an empty string."""
    for candidate in candidates:
        normalized = normalize_phone_number(candidate)
        if normalized:
            return normalized
    return ''

CRITICAL_FIELDS = ['isitEmergency', 'customerName', 'fromNumber']

# Every spelling a source may use for each canonical field, in priority order.
# Retell tool variables are renamed from time to time (isitEmergency -> is_emergency
# in June 2026 silently stopped emergency dispatch for two weeks), so extraction must
# never depend on a single spelling.
FIELD_ALIASES = {
    'fromNumber':     ('fromNumber', 'from_number'),
    'customerName':   ('customerName', 'customer_name', 'caller_name', 'name'),
    'serviceAddress': ('serviceAddress', 'service_address', 'caller_address',
                       'address', 'address_line1'),
    'callSummary':    ('callSummary', 'call_summary', 'issue_description'),
    'email':          ('email', 'caller_email', 'customer_email'),
    'isitEmergency':  ('isitEmergency', 'isEmergency', 'is_emergency', 'emergency'),
    'emergencyType':  ('emergencyType', 'emergency_type', 'service_type',
                       'issue_type', 'serviceLineName'),
}

def lookup_alias(source, field):
    """Return the first non-empty value for `field` under any of its known spellings."""
    if not isinstance(source, dict):
        return None
    for key in FIELD_ALIASES.get(field, (field,)):
        value = source.get(key)
        if value is not None and value != '':
            return value
    return None

def fetch_call_from_retell(call_id, api_key):
    """Fetch the full call object from the Retell API."""
    url = f"https://api.retellai.com/v2/get-call/{call_id}"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {api_key}",
        "Accept": "application/json",
    })
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=8, context=ctx) as resp:
        return json.loads(resp.read().decode("utf-8"))

def ensure_complete_data(call_data, extracted_vars):
    """
    If critical extracted fields are missing, re-fetch the call from
    the Retell API after a short delay so the analysis has time to finish.
    Returns a (possibly updated) tuple of (call_data, extracted_vars).
    """
    missing = [f for f in CRITICAL_FIELDS if not extracted_vars.get(f)]
    if not missing:
        return call_data, extracted_vars

    # Only retry when the post-call analysis genuinely has not landed yet. Retell does
    # not populate custom analysis for calls that never connected, and a blank
    # isitEmergency is a legitimate outcome on a non-emergency call — retrying those
    # burned 18s per request and always returned the same result.
    if (call_data.get('call_analysis') or {}).get('custom_analysis_data'):
        print(f"[RETRY] Skipped: analysis already present, {missing} legitimately empty")
        return call_data, extracted_vars

    api_key = os.environ.get('RETELL_API_KEY', 'key_69831f5ea37c7733b21533331182')

    call_id = call_data.get('call_id', '')
    print(f"[RETRY] Missing critical fields {missing} for {call_id}, waiting 3s then re-fetching...")

    for attempt in range(1, 4):
        delay = 3 * attempt
        time.sleep(delay)
        try:
            fresh = fetch_call_from_retell(call_id, api_key)
            fresh_vars = extract_variables_v3(fresh)
            still_missing = [f for f in CRITICAL_FIELDS if not fresh_vars.get(f)]
            print(f"[RETRY] Attempt {attempt} after {delay}s – still missing: {still_missing}")
            if not still_missing:
                return fresh, fresh_vars
            call_data = fresh
            extracted_vars = fresh_vars
        except Exception as e:
            print(f"[RETRY] Attempt {attempt} failed: {e}")

    print(f"[RETRY] Exhausted retries, proceeding with best available data")
    return call_data, extracted_vars

def forward_to_api_gateway(body_str, signature_header):
    """Forward webhook to API gateway synchronously before responding.
    Must complete within the serverless request lifecycle."""
    api_gateway_url = os.environ.get('API_GATEWAY_URL', '').strip()
    if not api_gateway_url:
        return

    event_type = None
    try:
        body_dict = json.loads(body_str)
        event_type = body_dict.get("event", "")
    except:
        pass

    # Only forward call_started, call_ended, and call_analyzed events
    if event_type not in ["call_started", "call_ended", "call_analyzed"]:
        return

    try:
        data = body_str.encode('utf-8')
        req = urllib.request.Request(
            api_gateway_url,
            data=data,
            headers={
                'Content-Type': 'application/json',
                'x-retell-signature': signature_header or ''
            }
        )
        with urllib.request.urlopen(req, timeout=3) as response:
            print(f"[API_GATEWAY] Forwarded {event_type} event, status: {response.status}")
    except Exception as e:
        # Swallow errors — forward failures must never block the main webhook response
        print(f"[API_GATEWAY] Error forwarding webhook: {e}")

def extract_variables_v3(call_data):
    """
    Extract dynamic variables for the third webhook for Braconier
    Variables: fromNumber, customerName, serviceAddress, callSummary, email, isitEmergency, emergencyType
    
    ENHANCED VERSION: Uses Adaptive Climate extraction logic with better fallback mappings
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
    analysis = call_data.get('call_analysis', {})
    custom_data = analysis.get('custom_analysis_data', {})
    
    def normalize_isit_emergency(value):
        """Normalize emergency flag to TRUE/FALSE strings."""
        if value is None:
            return ''
        if isinstance(value, bool):
            return 'TRUE' if value else 'FALSE'

        raw = str(value).strip()
        if not raw:
            return ''

        lowered = raw.lower()
        if lowered in ('true', 'yes', '1', 'y'):
            return 'TRUE'
        if lowered in ('false', 'no', '0', 'n'):
            return 'FALSE'

        return raw

    def finalize(var_dict):
        """Normalize extracted variables before returning."""
        var_dict['fromNumber'] = pick_best_from_number(
            var_dict.get('fromNumber', ''),
            call_data.get('from_number', ''),
            custom_data.get('caller_phone', ''),
            custom_data.get('phone', '')
        )
        var_dict['isitEmergency'] = normalize_isit_emergency(var_dict.get('isitEmergency', ''))
        return var_dict
    
    # Sources are consulted in priority order and each one only fills gaps left by the
    # previous. There is deliberately NO early return: a source that supplies some
    # fields must never stop a later source supplying the rest. Previously Method 1
    # returned as soon as it matched fromNumber/customerName/serviceAddress, which
    # discarded the emergency flag that only the post-call analysis knew how to
    # provide once the Retell tool renamed isitEmergency -> is_emergency.
    emergency_source = 'none'

    def fill(key, value):
        if not variables.get(key) and value:
            variables[key] = str(value)

    def absorb(source, label):
        """Fill still-empty fields from `source`, accepting every known spelling."""
        nonlocal emergency_source
        if not isinstance(source, dict) or not source:
            return
        for key in variables:
            if key == 'isitEmergency':
                continue  # handled below; a literal False must not be treated as empty
            if key == 'fromNumber' and source is not collected_vars:
                continue  # phone precedence is resolved explicitly below, not by alias order
            fill(key, lookup_alias(source, key))
        if not variables['isitEmergency']:
            normalized = normalize_isit_emergency(lookup_alias(source, 'isitEmergency'))
            if normalized:
                variables['isitEmergency'] = normalized
                emergency_source = label

    # Source 1: collected_dynamic_variables — written mid-call by extraction tools.
    collected_vars = call_data.get('collected_dynamic_variables') or {}
    absorb(collected_vars, 'collected_dynamic_variables')

    # Source 2: call_analysis.custom_analysis_data — post-call analysis, richest source.
    absorb(custom_data, 'custom_analysis_data')

    if custom_data:
        # Phone precedence, most deliberate source first: the number the agent captured
        # mid-call, then the callback number the caller stated, and only then the raw
        # caller ID. The technician is transferred to this number, so a stated callback
        # must outrank the line the customer happened to dial from.
        extracted_from_number = (
            variables.get('fromNumber', '') or
            custom_data.get('caller_phone', '') or
            custom_data.get('phone', '') or
            custom_data.get('fromNumber', '')
        )
        variables['fromNumber'] = pick_best_from_number(
            extracted_from_number,
            call_data.get('from_number', '')
        )

        # Build a service address from parts only when no pre-joined address exists.
        if not variables['serviceAddress']:
            address_line = (
                custom_data.get('service_address', '') or
                custom_data.get('address', '') or
                custom_data.get('caller_address', '') or
                custom_data.get('address_line1', '')
            )
            parts = [
                str(p).strip() for p in [
                    address_line,
                    custom_data.get('city', ''),
                    custom_data.get('state', ''),
                    custom_data.get('postal_code', ''),
                ] if p
            ]
            variables['serviceAddress'] = ', '.join(parts)

    transcript_with_tools = call_data.get('transcript_with_tool_calls') or []

    def absorb_tool_result(entry, label):
        content = entry.get('content', '')
        if not content:
            return
        try:
            result = json.loads(content)
        except (json.JSONDecodeError, TypeError):
            return
        if not isinstance(result, dict):
            return
        nested = result.get('variables')
        absorb(nested if isinstance(nested, dict) else result, label)

    # Source 3: the extract_variables tool result specifically, if the agent called it.
    extract_tool_id = None
    for entry in transcript_with_tools:
        if (entry.get('role') == 'tool_call_invocation' and
                entry.get('name') == 'extract_variables'):
            extract_tool_id = entry.get('tool_call_id')
            break
    if extract_tool_id:
        for entry in transcript_with_tools:
            if (entry.get('role') == 'tool_call_result' and
                    entry.get('tool_call_id') == extract_tool_id):
                absorb_tool_result(entry, 'extract_variables_tool')

    # Source 4: any other tool result carrying one of our fields.
    for entry in transcript_with_tools:
        if entry.get('role') == 'tool_call_result':
            absorb_tool_result(entry, 'tool_call_result')

    # Source 5: direct fields on the call object (last resort).
    absorb(call_data, 'call_data')

    if not variables['callSummary']:
        variables['callSummary'] = str(analysis.get('call_summary', ''))

    print(f"[SHEETS3] emergency resolved via {emergency_source} -> "
          f"isitEmergency={variables['isitEmergency']!r} "
          f"emergencyType={variables['emergencyType']!r}")

    return finalize(variables)

def get_tech_data_from_api(emergency_type=''):
    """
    Get tech data (email and phone) from the plumbing and HVAC API endpoints based on emergency type
    Priority based on emergencyType:
    - If emergencyType is 'Plumbing': Try plumbing API first, then HVAC as fallback
    - If emergencyType is 'HVAC' or empty: Try HVAC API first, then plumbing as fallback
    
    Args:
        emergency_type (str): The type of emergency ('Plumbing', 'HVAC', etc.)
    
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
        plumbing_api = "https://plumbing-api.vercel.app/api/assignments"
        hvac_api = "https://hvacapi.vercel.app/api/assignments"
        
        # Determine API priority based on emergency type
        if emergency_type == 'Plumbing':
            primary_api = plumbing_api
            primary_name = "PLUMBING API"
            fallback_api = hvac_api
            fallback_name = "HVAC API"
            print(f"[API] Emergency type is 'Plumbing' - trying Plumbing API first")
        elif emergency_type == 'HVAC':
            primary_api = hvac_api
            primary_name = "HVAC API"
            fallback_api = plumbing_api
            fallback_name = "PLUMBING API"
            print(f"[API] Emergency type is 'HVAC' - trying HVAC API first")
        else:
            # Default to HVAC API for empty or unknown emergency types
            primary_api = hvac_api
            primary_name = "HVAC API"
            fallback_api = plumbing_api
            fallback_name = "PLUMBING API"
            print(f"[API] Emergency type is '{emergency_type}' (unknown/empty) - defaulting to HVAC API first")
        
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

def send_to_google_sheets_v3(call_data, extracted_vars, call_summary, tech_data):
    """
    Send call analysis data to the third Google Sheets using Google Apps Script Web App
    """
    try:
        # Use the Braconier webhook URL (set as environment variable)
        sheets_url = os.environ.get('BRACONIER_EXEC_URL', '')
        
        print(f"[SHEETS3] Using URL: {sheets_url[:50]}..." if sheets_url else "[SHEETS3] No URL set")
        
        if not sheets_url:
            print("[ERROR] BRACONIER_EXEC_URL environment variable not set")
            return False
        
        # Get transcript
        transcript = call_data.get('transcript', '')
        
        # Prepare data for Google Sheets matching exact header structure:
        # Timestamp, Call ID, Agent Name, Duration (ms), Sentiment, Successful, Call Summary, 
        # From Number, Customer Name, Service Address, Email, Phone, Is Emergency, Emergency Type, 
        # Transcript, make_call, response_call_id_1, response_call_id_2, response_call_id_3, 
        # call_decline_counter, LAST_CALL_TIME, is_email_sent, NOTE
        
        sheet_data = {
            'timestamp': datetime.now().isoformat(),
            'call_id': call_data.get('call_id', ''),
            'agent_name': call_data.get('agent_name', ''),
            'duration_ms': call_data.get('duration_ms', 0),
            'sentiment': call_data.get('call_analysis', {}).get('user_sentiment', ''),
            'successful': call_data.get('call_analysis', {}).get('call_successful', False),
            'call_summary': call_summary,
            'from_number': extracted_vars.get('fromNumber', ''),
            'customer_name': extracted_vars.get('customerName', ''),
            'service_address': extracted_vars.get('serviceAddress', ''),
            'email': tech_data.get('email', ''),  # Tech email from API
            'phone': tech_data.get('phone', ''),  # Tech phone from API
            'is_emergency': extracted_vars.get('isitEmergency', ''),
            'emergency_type': extracted_vars.get('emergencyType', ''),
            'transcript': transcript,
            'make_call': True,  # Always set to True initially
            'response_call_id_1': '',
            'response_call_id_2': '',
            'response_call_id_3': '',
            'call_decline_counter': 0,
            'last_call_time': '',
            'is_email_sent': False,  # Always FALSE when sending to Apps Script
            'note': ''
        }
        
        # Log the data being sent for debugging
        print(f"[SHEETS3] Data being sent:")
        print(f"[SHEETS3] from_number: '{sheet_data.get('from_number')}'")
        print(f"[SHEETS3] customer_name: '{sheet_data.get('customer_name')}'")
        print(f"[SHEETS3] service_address: '{sheet_data.get('service_address')}'")
        print(f"[SHEETS3] email: '{sheet_data.get('email')}'")
        print(f"[SHEETS3] phone: '{sheet_data.get('phone')}'")
        print(f"[SHEETS3] is_emergency: '{sheet_data.get('is_emergency')}'")
        print(f"[SHEETS3] emergency_type: '{sheet_data.get('emergency_type')}'")
        print(f"[SHEETS3] make_call: '{sheet_data.get('make_call')}'")
        print(f"[SHEETS3] is_email_sent: '{sheet_data.get('is_email_sent')}'")
        print(f"[SHEETS3] Tech data used - name: '{tech_data.get('name', '')}', email: '{tech_data.get('email', '')}', phone: '{tech_data.get('phone', '')}'")
        
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
            print(f"[SHEETS3] Data sent successfully: {result}")
            return True
            
    except Exception as e:
        print(f"[SHEETS3 ERROR] Failed to send data: {e}")
        return False

class handler(BaseHTTPRequestHandler):
    """Braconier webhook handler for processing Retell call events"""
    
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
                print(f"[SHEETS3] Found duplicate hash: {content_hash}")
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
            
            print(f"[SHEETS3] New call hash: {content_hash}")
            return False
            
        except Exception as e:
            print(f"[SHEETS3 ERROR] Error checking duplicate: {e}")
            return False  # If error, allow processing to continue

    def load_processed_calls(self):
        """Load processed calls from file"""
        try:
            if os.path.exists(PROCESSED_CALLS_FILE):
                with open(PROCESSED_CALLS_FILE, 'r') as f:
                    return json.load(f)
        except Exception as e:
            print(f"[SHEETS3 ERROR] Error loading processed calls: {e}")
        return {}

    def save_processed_calls(self, processed_calls):
        """Save processed calls to file"""
        try:
            with open(PROCESSED_CALLS_FILE, 'w') as f:
                json.dump(processed_calls, f)
        except Exception as e:
            print(f"[SHEETS3 ERROR] Error saving processed calls: {e}")

    def cleanup_processed_calls(self, processed_calls):
        """Clean up old processed calls to prevent file from growing too large"""
        try:
            current_time = datetime.now()
            cutoff_time = current_time.timestamp() * 1000 - (24 * 60 * 60 * 1000)  # 24 hours ago in milliseconds
            
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
                
            print(f"[SHEETS3] Cleaned up processed calls, {len(processed_calls)} entries remaining")
            
        except Exception as e:
            print(f"[SHEETS3 ERROR] Error cleaning up processed calls: {e}")

    def do_GET(self):
        """Handle GET requests (health check)"""
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        response = {
            "message": "Google Sheets Integration API v3 (Plumbing/HVAC)",
            "status": "healthy",
            "variables": ["fromNumber", "customerName", "serviceAddress", "callSummary", "email", "phone", "techName", "isitEmergency", "emergencyType"],
            "apis": ["Plumbing API", "HVAC API"],
            "endpoints": {
                "POST /": "Process call analysis data and send to Google Sheets v3"
            }
        }
        self.wfile.write(json.dumps(response).encode())

    def do_POST(self):
        """Handle POST requests - process call analysis and send to Google Sheets v3"""
        try:
            # Read the request body
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length > 0:
                post_data = self.rfile.read(content_length)
                body_str = post_data.decode('utf-8')
                body = json.loads(body_str)
            else:
                body_str = '{}'
                body = {}
            
            # Forward to API gateway (non-blocking, only for call_started, call_ended, and call_analyzed)
            signature_header = self.headers.get('x-retell-signature', '') or self.headers.get('X-Retell-Signature', '')
            try:
                forward_to_api_gateway(body_str, signature_header)
            except Exception as fwd_err:
                # Isolated guard — forwarding errors must never affect the main response
                print(f"[API_GATEWAY] Unexpected forwarding error (ignored): {fwd_err}")
            
            # Extract event information
            event_type = body.get("event", "unknown")
            call_data = body.get("call", {})
            call_id = call_data.get("call_id", "unknown")
            
            print(f"[SHEETS3 API] Received event: {event_type}, Call ID: {call_id}")
            
            # Only process call_analyzed events
            if event_type == "call_analyzed":
                # Check for duplicate processing
                if self.is_duplicate_call(call_data):
                    print(f"[SHEETS3] Duplicate call detected, skipping processing for {call_id}")
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
                
                print(f"[SHEETS3 API] Processing new call analysis for {call_id}")
                
                # Extract variables from Retell's call data
                extracted_vars = extract_variables_v3(call_data)
                print(f"[SHEETS3 API] INITIAL EXTRACTED VARIABLES: {extracted_vars}")

                # Re-fetch from Retell API if critical fields are missing
                call_data, extracted_vars = ensure_complete_data(call_data, extracted_vars)
                analysis = call_data.get("call_analysis", {})
                call_summary = analysis.get("call_summary", "") or call_summary
                print(f"[SHEETS3 API] FINAL EXTRACTED VARIABLES: {extracted_vars}")
                
                # Get tech data from external APIs based on emergency type
                try:
                    emergency_type = extracted_vars.get('emergencyType', '')
                    print(f"[SHEETS3] Emergency type detected: '{emergency_type}'")
                    print(f"[SHEETS3] Calling get_tech_data_from_api() with emergency_type='{emergency_type}'...")
                    tech_data = get_tech_data_from_api(emergency_type)
                    if not isinstance(tech_data, dict):
                        tech_data = {'name': '', 'email': '', 'phone': ''}
                    print(f"[SHEETS3] Tech data from API: {tech_data}")
                    print(f"[SHEETS3] Tech data name: '{tech_data.get('name', '')}'")
                    print(f"[SHEETS3] Tech data email: '{tech_data.get('email', '')}'")
                    print(f"[SHEETS3] Tech data phone: '{tech_data.get('phone', '')}'")
                except Exception as e:
                    print(f"[SHEETS3] Error getting tech data: {e}")
                    tech_data = {'name': '', 'email': '', 'phone': ''}
                
                # Log successful extractions
                non_empty_vars = {k: v for k, v in extracted_vars.items() if v}
                if non_empty_vars:
                    print(f"[SHEETS3 API] SUCCESS: Extracted {len(non_empty_vars)} variables: {non_empty_vars}")
                else:
                    print(f"[SHEETS3 API] ERROR: No variables extracted for call {call_id}")
                
                # Send to Google Sheets
                try:
                    success = send_to_google_sheets_v3(call_data, extracted_vars, call_summary, tech_data)
                    
                    if success:
                        response_data = {
                            "status": "success",
                            "message": "Data sent to Google Sheets v3 (Plumbing/HVAC)",
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
                    print(f"[SHEETS3 API ERROR] Exception in Google Sheets operation: {e}")
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
            print(f"[SHEETS3 API ERROR] Invalid JSON payload: {e}")
            self.send_response(400)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            error_response = {"error": "Invalid JSON payload"}
            self.wfile.write(json.dumps(error_response).encode())
            
        except Exception as e:
            print(f"[SHEETS3 API ERROR] Processing failed: {e}")
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
