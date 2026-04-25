FROM node:22-bookworm-slim AS ui-builder

WORKDIR /app/benchmarks/lab/ui

COPY benchmarks/lab/ui/package.json benchmarks/lab/ui/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY benchmarks/lab/ui/ ./
RUN npm run build


FROM python:3.11-slim AS app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libfreetype6 \
        fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY . .
COPY --from=ui-builder /app/benchmarks/lab/ui/dist /app/benchmarks/lab/ui/dist

EXPOSE 8201

CMD ["uvicorn", "benchmarks.lab.main:app", "--host", "0.0.0.0", "--port", "8201"]
