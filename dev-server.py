#!/usr/bin/env python3
"""
Vimicx local dev server.
Serves static files AND handles POST /save-config to write scene-config.json.
Production (Vercel) serves static files directly and never runs this script.
"""
import http.server
import json
import os
import socketserver

PORT = 8080
BIND = '127.0.0.1'
CONFIG_FILE = 'scene-config.json'


class DevHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path != '/save-config':
            self.send_error(404)
            return
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length).decode('utf-8')
            data = json.loads(body)
            with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
                f.write('\n')
            self._respond(200, {'ok': True})
        except Exception as e:
            self._respond(500, {'error': str(e)})

    def _respond(self, code, body):
        payload = json.dumps(body).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, fmt, *args):
        pass  # silence per-request logs


class ReusingServer(socketserver.TCPServer):
    allow_reuse_address = True


if __name__ == '__main__':
    # Always serve from the project root (where this script lives)
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    with ReusingServer((BIND, PORT), DevHandler) as httpd:
        print(f'  Vimicx Dev Server  →  http://{BIND}:{PORT}/?dev')
        print(f'  Saves config to    →  {CONFIG_FILE}')
        print('  Ctrl+C to stop\n')
        httpd.serve_forever()
