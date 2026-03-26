# Base image
FROM python:3.12-slim

WORKDIR /app

# Copy dependency list
COPY requirements.txt ./

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Mount point for bundled default projects
VOLUME ["/default_projects"]

# Expose backend port
EXPOSE 8080

# Start FastAPI server
CMD ["python", "main.py"]
