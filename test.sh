#!/bin/bash
# Runs the automatic test. Start the app first (bash start.sh) in another terminal.
# Test a deployed app with: bash test.sh https://your-app.vercel.app
cd "$(dirname "$0")"
source .venv/Scripts/activate 2>/dev/null || source .venv/bin/activate
python test_flow.py "$@"
