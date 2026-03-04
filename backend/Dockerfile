FROM python:3.11-slim

WORKDIR /app

# Install system dependencies needed for PyEZ (libxml2, libxslt, etc)
RUN apt-get update && apt-get install -y \
    gcc \
    libxml2-dev \
    libxslt1-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Run the FastAPI app on port 3041
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3041", "--reload"]
