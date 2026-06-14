# Hexaone AI Bot - Start Script
# Run this in PowerShell from the ai_bot folder

Write-Host "🤖 Starting Hexaone AI Bot..." -ForegroundColor Cyan

# Check if venv exists
if (-not (Test-Path "venv")) {
    Write-Host "Creating virtual environment..." -ForegroundColor Yellow
    python -m venv venv
}

# Activate venv
.\venv\Scripts\Activate.ps1

# Install dependencies
Write-Host "Installing dependencies..." -ForegroundColor Yellow
pip install -r requirements.txt -q

# Start the bot
Write-Host "✅ Bot starting on http://localhost:8000" -ForegroundColor Green
Write-Host "📖 API docs: http://localhost:8000/docs" -ForegroundColor Blue
uvicorn main:app --reload --port 8000
