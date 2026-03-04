#!/bin/bash

# Start FastAPI Backend
echo "Starting FastAPI Backend on port 3041..."
cd /app/backend
uvicorn main:app --host 0.0.0.0 --port 3041 &
BACKEND_PID=$!

# Start Next.js Frontend
echo "Starting Next.js Frontend on port 3040..."
cd /app/frontend
npm start -- -p 3040 &
FRONTEND_PID=$!

# Wait for either process to exit
wait -n

# Exit with status of process that exited first
exit $?
