from http.server import BaseHTTPRequestHandler
import json


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()

        response = {
            "service": "CLARA lead capture webhook integration",
            "purpose": "Processes Retell call analysis events and sends normalized data into company-specific Google Sheets automations.",
            "event_handling": {
                "accepted_event": "call_analyzed",
                "request_type": "JSON webhook payload",
                "response_behavior": "Returns success when payload is processed or safely skipped."
            },
            "configuration": {
                "required_environment_variables": [
                    "PACIFIC_EXEC_URL",
                    "BRACONIER_EXEC_URL",
                    "ADAPTIVE_EXEC_URL",
                    "ELITEFIRE_EXEC_URL"
                ],
                "optional_environment_variables": [
                    "FALLBACK_TECH_EMAIL",
                    "FALLBACK_TECH_PHONE"
                ]
            },
            "company_workflows": [
                {
                    "company": "Pacific Western",
                    "what_it_does": "Extracts caller and job context, resolves technician details, and writes the result into the Pacific workflow sheet."
                },
                {
                    "company": "Braconier",
                    "what_it_does": "Processes plumbing/HVAC call data, applies fallback logic, and posts structured records into the Braconier workflow sheet."
                },
                {
                    "company": "Adaptive Climate",
                    "what_it_does": "Handles Adaptive Climate calls, enriches records with technician assignment data, and forwards to the Adaptive sheet flow."
                },
                {
                    "company": "EliteFire",
                    "what_it_does": "Processes EliteFire calls, includes recording context, and sends final payloads into the EliteFire automation sheet."
                }
            ]
        }
        self.wfile.write(json.dumps(response).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
