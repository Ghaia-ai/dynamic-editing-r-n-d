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
        # playwright runtime deps for chromium headless
        libnss3 libatk-bridge2.0-0 libxkbcommon0 libxcomposite1 libxdamage1 \
        libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 \
        libcups2 libdbus-1-3 libdrm2 libatspi2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install -r requirements.txt
# install only the chromium browser binary for playwright (smaller than `install`)
RUN python -m playwright install chromium --with-deps 2>&1 | tail -5 || python -m playwright install chromium

COPY . .
COPY --from=ui-builder /app/benchmarks/lab/ui/dist /app/benchmarks/lab/ui/dist

EXPOSE 8201

CMD ["uvicorn", "benchmarks.lab.main:app", "--host", "0.0.0.0", "--port", "8201"]
