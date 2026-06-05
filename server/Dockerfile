FROM python:3.11-slim

# System libs required by Pillow / scikit-image / trimesh (image + mesh I/O).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libgomp1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY pyproject.toml ./

RUN pip install --no-cache-dir \
    "fastapi>=0.115" \
    "uvicorn[standard]>=0.30" \
    "python-multipart>=0.0.9" \
    "pillow>=10.4" \
    "numpy>=1.26,<2.3" \
    "scipy>=1.13" \
    "scikit-image>=0.24" \
    "trimesh>=4.5" \
    "pygltflib>=1.16" \
    "fast-simplification>=0.1.7"

COPY app ./app

ENV DATA_DIR=/data \
    PYTHONUNBUFFERED=1
RUN mkdir -p /data/meshes

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
