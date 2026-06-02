#!/usr/bin/env python3
"""
Vimicx local dev server.
Serves static files AND handles POST /save-config to write scene-config.json.
Production (Vercel) serves static files directly and never runs this script.
"""
import http.server
import json
import os
import re
import socketserver
import time
from urllib.parse import urlparse, parse_qs

PORT = 8080
BIND = '127.0.0.1'
CONFIG_FILE = 'scene-config.json'
MEDIA_DIR   = os.path.join('img', 'screen-media')


class DevHandler(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/save-config':
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

        elif self.path.startswith('/upload-media'):
            try:
                query  = parse_qs(urlparse(self.path).query)
                name   = query.get('name', ['file'])[0]
                # Strip path traversal and keep only safe characters
                name   = re.sub(r'[^A-Za-z0-9._-]', '_', os.path.basename(name))
                stem, ext = os.path.splitext(name)
                name = f'{stem}-{int(time.time() * 1000)}{ext}'
                length = int(self.headers.get('Content-Length', 0))
                body   = self.rfile.read(length)
                os.makedirs(MEDIA_DIR, exist_ok=True)
                with open(os.path.join(MEDIA_DIR, name), 'wb') as f:
                    f.write(body)
                self._respond(200, {'ok': True, 'path': f'img/screen-media/{name}'})
            except Exception as e:
                self._respond(500, {'error': str(e)})

        else:
            self.send_error(404)

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
