FROM nvidia/cuda:12.4.1-runtime-ubuntu22.04

RUN apt-get update && apt-get install -y python3 python3-pip && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .

# Install base deps
RUN pip3 install --no-cache-dir -r requirements.txt

# Install ML deps (uncomment for GPU deployment)
# RUN pip3 install --no-cache-dir torch transformers accelerate qwen-vl-utils

COPY main.py .

ENV MOCK_MODE=0
EXPOSE 8100

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8100"]
