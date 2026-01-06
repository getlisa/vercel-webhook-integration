from http.server import BaseHTTPRequestHandler
import json
import urllib.parse

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        """Handle GET requests (health check)"""
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        response = {
            "message": "Retell AI Webhook Handler is running on Vercel",
            "status": "healthy"
        }
        self.wfile.write(json.dumps(response).encode())

    def do_POST(self):
        """Handle POST requests (webhook events)"""
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
            
            # Log the webhook event (visible in Vercel function logs)
            print(f"[WEBHOOK] Event: {event_type}, Call ID: {call_id}")
            
            # Process different event types
            if event_type == "call_started":
                agent_name = call_data.get("agent_name", "Unknown Agent")
                call_type = call_data.get("call_type", "unknown")
                print(f"[CALL_STARTED] {call_id}")
                print(f"  └─ Agent: {agent_name}")
                print(f"  └─ Type: {call_type}")
                print(f"  └─ Timestamp: {call_data.get('start_timestamp', 'N/A')}")
                
            elif event_type == "call_ended":
                duration = call_data.get("duration_ms", 0)
                status = call_data.get("call_status", "unknown")
                cost = call_data.get("call_cost", {}).get("combined_cost", 0)
                print(f"[CALL_ENDED] {call_id}")
                print(f"  └─ Duration: {duration}ms ({duration/1000:.1f}s)")
                print(f"  └─ Status: {status}")
                print(f"  └─ Cost: ${cost}")
                
            elif event_type == "call_analyzed":
                analysis = call_data.get("call_analysis", {})
                sentiment = analysis.get("user_sentiment", "unknown")
                successful = analysis.get("call_successful", False)
                summary = analysis.get("call_summary", "No summary")
                print(f"[CALL_ANALYZED] {call_id}")
                print(f"  └─ Sentiment: {sentiment}")
                print(f"  └─ Success: {successful}")
                print(f"  └─ Summary: {summary[:100]}...")
                
            else:
                print(f"[UNKNOWN_EVENT] {event_type} - Call ID: {call_id}")
                print(f"  └─ Full payload keys: {list(body.keys())}")
            
            # Send 204 No Content response
            self.send_response(204)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
        except json.JSONDecodeError as e:
            print(f"[ERROR] Invalid JSON payload: {e}")
            self.send_response(400)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            error_response = {"error": "Invalid JSON payload"}
            self.wfile.write(json.dumps(error_response).encode())
            
        except Exception as e:
            print(f"[ERROR] Webhook processing failed: {e}")
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