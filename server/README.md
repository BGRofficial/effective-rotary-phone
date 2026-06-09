# Projection Mapping Reconstruction Server

FastAPI service that turns the 6 face silhouettes captured by the studio
client into a real 3D triangle mesh (`.glb`) for projection mapping.

## Pipeline (v1 — visual hull)

1. Decode + downscale each of the 6 face PNGs.
2. Carve a 160³ voxel grid against the silhouettes ("visual hull").
3. Marching Cubes → triangle mesh.
4. Keep largest component → Laplacian smooth → quadric-decimate to ~12k tris
   → normalize to `[-0.95, 0.95]³`.
5. Export `.glb`.

> A future iteration plugs DepthAnything V2 monocular depth into the same
> fusion loop to refine concavities. The pipeline module structure is set up
> for that drop-in.

## Run

```bash
cd server
docker compose up --build
# Server: http://localhost:8000
# Health: http://localhost:8000/health
```

Generated meshes are written to `./data/meshes/` (mounted into the container).

## API

| Method | Path                              | Description                              |
|--------|-----------------------------------|------------------------------------------|
| POST   | `/reconstruct`                    | multipart `front/back/left/right/top/bottom` PNGs → `{ job_id }` |
| GET    | `/jobs/{job_id}`                  | `{ status, stage, progress, mesh_url?, triangle_count?, error? }` |
| GET    | `/static/meshes/{job_id}.glb`     | binary `.glb`                            |
| POST   | `/depth`                          | multipart `image` (+ optional `mask`) → grayscale depth PNG |
| GET    | `/health`                         | liveness + version                       |

### `/depth` — camera relief sensor

Per-pixel depth from a single face photo via DepthAnything V2 Small (ONNX,
int8). Output is an 8-bit grayscale PNG sized to match the input — brighter
pixels are closer to the camera (surface bumps). Pass an RGBA silhouette in
`mask` and the depth values are renormalized over the masked region so the
object's own near/far range — not the camera offset — drives the contrast.

```bash
curl -s -X POST http://localhost:8000/depth \
  -F image=@front.png \
  -F mask=@front_mask.png \
  -o front_depth.png
```

### Try it with curl

```bash
curl -s -X POST http://localhost:8000/reconstruct \
  -F front=@front.png  -F back=@back.png \
  -F left=@left.png   -F right=@right.png \
  -F top=@top.png     -F bottom=@bottom.png
# {"job_id":"5e2bce3..."}

curl -s http://localhost:8000/jobs/5e2bce3...
# {"status":"running","stage":"meshing","progress":0.5,...}
# Poll until "status":"done".

curl -O http://localhost:8000/static/meshes/5e2bce3....glb
```

## Configuration (env vars)

| Var                  | Default                                   | Purpose                                |
|----------------------|-------------------------------------------|----------------------------------------|
| `ALLOWED_ORIGINS`    | `http://localhost:5173,http://localhost:4173` | CORS allow-list, comma-separated   |
| `VOXEL_RESOLUTION`   | `160`                                     | Voxels per axis (memory ~D³ × 4B)      |
| `MESH_TARGET_FACES`  | `12000`                                   | Decimation target                      |
| `MAX_INPUT_DIM`      | `768`                                     | Downscale longest input edge to this   |
| `DATA_DIR`           | `/data`                                   | Where meshes are written + served      |
| `JOB_TTL_HOURS`      | `24`                                      | Retention of finished jobs             |

## Tests

```bash
cd server
pip install -e ".[dev]"
pytest -q
```

## Notes

- Job state is in-memory. Restart wipes the queue. Upgrade to Redis/RQ for
  multi-worker / persistence — `app/jobs.py` is the only file that changes.
- CPU-only by default. Add a GPU profile once a depth model is integrated.
