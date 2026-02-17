from http.server import BaseHTTPRequestHandler
import json
import os
from datetime import datetime
import urllib.request
import urllib.parse
import ssl
import hashlib

# Google Apps Script URLs for each client
CLIENT_URLS = {
    'braconier': os.environ.get('BRACONIER_EXEC_URL', ''),
    'adaptive': os.environ.get('ADAPTIVE_EXEC_URL', ''),
    'elitefire': os.environ.get('ELITEFIRE_EXEC_URL', ''),
    'pacific': os.environ.get('PACIFIC_EXEC_URL', ''),
}

def extract_variables(call_data):
    """Extract dynamic variables from Retell call data"""
    variables = {
        'fromNumber': '',
        'customerName': '',
        'serviceAddress': '',
        'callSummary': '',
        'email': '',
        'isitEmergency': '',
        'emergencyType': ''
    }
    
    def normalize_emergency(value):
        if value is None:
            return ''
        if isinstance(value, bool):
            return 'TRUE' if value else 'FALSE'
        raw = str(value).strip().lower()
        if raw in ('true', 'yes', '1', 'y'):
            return 'TRUE'
        if raw in ('false', 'no', '0', 'n'):
            return 'FALSE'
        return str(value)
    
    # Method 1: collected_dynamic_variables
    collected = call_data.get('collected_dynamic_variables', {})
    if collected:
        for key in variables:
            if key in collected and collected[key]:
                variables[key] = str(collected[key])
    
    # Method 2: call_analysis.custom_analysis_data
    analysis = call_data.get('call_analysis', {})
    custom = analysis.get('custom_analysis_data', {})
    if custom:
        if not variables['fromNumber']:
            variables['fromNumber'] = str(custom.get('fromNumber', '') or custom.get('caller_phone', '') or call_data.get('from_number', ''))
        if not variables['customerName']:
            variables['customerName'] = str(custom.get('customerName', '') or custom.get('caller_name', ''))
        if not variables['serviceAddress']:
            variables['serviceAddress'] = str(custom.get('serviceAddress', '') or custom.get('caller_address', ''))
        if not variables['callSummary']:
            variables['callSummary'] = str(custom.get('issue_description', '') or analysis.get('call_summary', ''))
        if not variables['isitEmergency']:
            variables['isitEmergency'] = normalize_emergency(custom.get('isitEmergency', '') or custom.get('isEmergency', ''))
        if not variables['emergencyType']:
            variables['emergencyType'] = str(custom.get('emergencyType', '') or custom.get('emergency_type', ''))
    
    # Fallback for call summary
    if not variables['callSummary']:
        variables['callSummary'] = analysis.get('call_summary', '')
    
    # Fallback for fromNumber
    if not variables['fromNumber']:
        variables['fromNumber'] = call_data.get('from_number', '')
    
    variables['isitEmergency'] = normalize_emergency(variables['isitEmergency'])
    
    return variables

def get_tech_data(emergency_type=''):
    """Get on-call tech data from APIs"""
    def try_api(url, name):
        try:
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            with urllib.request.urlopen(url, timeout=10, context=ctx) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                if isinstance(data, dict):
                    assignments = data.get('assignments', [])
                    for assignment in assignments:
                        if assignment:
                            for tech in assignment.get('techs', []):
                                if tech and (tech.get('email') or tech.get('phone')):
                                    return {'name': tech.get('name', ''), 'email': tech.get('email', ''), 'phone': tech.get('phone', '')}
        except Exception as e:
            print(f"[API ERROR] {name}: {e}")
        return {'name': '', 'email': '', 'phone': ''}
    
    hvac_api = "https://hvacapi.vercel.app/api/assignments"
    plumbing_api = "https://plumbing-api.vercel.app/api/assignments"
    
    if emergency_type == 'Plumbing':
        result = try_api(plumbing_api, "Plumbing")
        if result['email'] or result['phone']:
            return result
        return try_api(hvac_api, "HVAC")
    else:
        result = try_api(hvac_api, "HVAC")
        if result['email'] or result['phone']:
            return result
        return try_api(plumbing_api, "Plumbing")

def send_to_sheets(client, call_data, extracted, tech_data):
    """Send data to Google Sheets via Apps Script"""
    sheets_url = CLIENT_URLS.get(client, '')
    
    if not sheets_url:
        print(f"[ERROR] No URL configured for client: {client}")
        return False
    
    analysis = call_data.get('call_analysis', {})
    
    sheet_data = {
        'timestamp': datetime.now().isoformat(),
        'call_id': call_data.get('call_id', ''),
        'agent_name': call_data.get('agent_name', ''),
        'duration_ms': call_data.get('duration_ms', 0),
        'sentiment': analysis.get('user_sentiment', ''),
        'successful': analysis.get('call_successful', False),
        'call_summary': extracted.get('callSummary', '') or analysis.get('call_summary', ''),
        'from_number': extracted.get('fromNumber', ''),
        'customer_name': extracted.get('customerName', ''),
        'service_address': extracted.get('serviceAddress', ''),
        'email': tech_data.get('email', ''),
        'phone': tech_data.get('phone', ''),
        'is_emergency': extracted.get('isitEmergency', ''),
        'emergency_type': extracted.get('emergencyType', ''),
        'transcript': call_data.get('transcript', ''),
        'make_call': True,
        'response_call_id_1': '',
        'response_call_id_2': '',
        'response_call_id_3': '',
        'call_decline_counter': 0,
        'last_call_time': '',
        'is_email_sent': False,
        'note': ''
    }
    
    print(f"[SHEETS] Sending to {client}: call_id={sheet_data['call_id']}, customer={sheet_data['customer_name']}")
    
    try:
        data = json.dumps(sheet_data).encode('utf-8')
        req = urllib.request.Request(sheets_url, data=data, headers={'Content-Type': 'application/json'})
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        
        with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
            result = resp.read().decode('utf-8')
            print(f"[SHEETS] Success: {result}")
            return True
    except Exception as e:
        print(f"[SHEETS ERROR] {e}")
        return False

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        response = {
            "message": "Retell Webhook Handler",
            "status": "healthy",
            "usage": "POST /api/webhook?client=braconier (or adaptive, elitefire, pacific)",
            "clients": list(CLIENT_URLS.keys())
        }
        self.wfile.write(json.dumps(response).encode())

    def do_POST(self):
        try:
            # Parse query string for client parameter
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            client = params.get('client', [''])[0].lower()
            
            if not client:
                # Try to detect from path
                path_parts = parsed.path.strip('/').split('/')
                if len(path_parts) > 1:
                    client = path_parts[-1].lower()
            
            print(f"[WEBHOOK] Client: {client}, Path: {self.path}")
            
            # Read request body
            content_length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(content_length).decode('utf-8')) if content_length > 0 else {}
            
            event_type = body.get("event", "unknown")
            call_data = body.get("call", {})
            call_id = call_data.get("call_id", "unknown")
            
            print(f"[WEBHOOK] Event: {event_type}, Call ID: {call_id}")
            
            # Only process call_analyzed events
            if event_type == "call_analyzed" and client:
                extracted = extract_variables(call_data)
                print(f"[WEBHOOK] Extracted: {extracted}")
                
                tech_data = get_tech_data(extracted.get('emergencyType', ''))
                print(f"[WEBHOOK] Tech data: {tech_data}")
                
                success = send_to_sheets(client, call_data, extracted, tech_data)
                
                response_data = {
                    "status": "success" if success else "error",
                    "client": client,
                    "call_id": call_id,
                    "extracted": extracted
                }
            else:
                response_data = {
                    "status": "ignored",
                    "message": f"Event '{event_type}' not processed" if event_type != "call_analyzed" else "No client specified",
                    "call_id": call_id
                }
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(response_data).encode())
            
        except Exception as e:
            print(f"[ERROR] {e}")
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
