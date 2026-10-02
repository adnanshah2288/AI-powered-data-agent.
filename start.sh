#!/bin/bash
# One command to set up and start the app. Run it with: bash start.sh
cd "$(dirname "$0")"

if [ ! -f .env ]; then
  echo "Missing .env file. Copy .env.example to .env and fill in your keys, then run this again."
  exit 1
fi

PY=python
command -v python >/dev/null 2>&1 || PY=python3

if [ ! -d .venv ]; then
  echo "Creating virtual environment..."
  $PY -m venv .venv
fi
source .venv/Scripts/activate 2>/dev/null || source .venv/bin/activate

echo "Installing packages (quick if already installed)..."
pip install -q -r requirements.txt -r requirements-dev.txt

echo "Starting the app at http://localhost:8000  (press Ctrl+C to stop)"
python -m uvicorn api.index:app --port 8000
