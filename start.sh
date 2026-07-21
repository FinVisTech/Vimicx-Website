#!/bin/bash

# Open the browser after a short delay in the background
(sleep 1.5 && open "http://127.0.0.1:8080/?dev") &

# Start the Python dev server (this blocks until Ctrl+C)
echo "========================================"
echo "  VIMICX - Starting Local Dev Server (macOS)"
echo "========================================"
echo ""

python3 dev-server.py
