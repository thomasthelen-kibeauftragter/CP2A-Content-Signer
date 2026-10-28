# CP2A Content Signer

Open-source microservice that signs AI-generated images with **C2PA Content Credentials**, marking them as
`trainedAlgorithmicMedia` for machine-readable disclosure under **EU AI Act Art. 50**.

```
ui-web (TypeScript/React) --HTTP--> server-go (Go) --subprocess--> core-rust (Rust, c2pa-rs)
```

| Dir | Role |
|---|---|
| `core-rust/` | `signer-core` CLI: builds + signs the manifest, and inspects files |
| `server-go/` | REST API: `POST /api/v1/sign`, `POST /api/v1/inspect`, `GET /health` |
| `ui-web/` | Drag-and-drop sign + verify UI (Vite, React, Tailwind) |
| `comfyui-node/` | ComfyUI custom node calling the API |

## Run

```bash
make dev            # Go API on :8080, UI on :5173
docker compose up   # everything on :8080
```

```bash
curl -F image=@in.png -F model_name=FLUX.1-dev -F creator="Jane Doe" \
     http://localhost:8080/api/v1/sign -o signed.png
curl -F image=@signed.png http://localhost:8080/api/v1/inspect
```

Form fields for `/sign`: `image`, `model_name`, `creator` (required); `copyright`, `prompt_optional` (optional;
the prompt is only embedded if supplied). Config via env: `ADDR`, `SIGNER_BIN`, `C2PA_CERT`, `C2PA_KEY`,
`MAX_UPLOAD_MB`, `WORKERS`, `RATE_LIMIT_PER_MIN`, `SIGN_TIMEOUT_SEC`, `STATIC_DIR`.

CLI: `signer-core --input in.jpg --output out.jpg --model "FLUX.1" --author "Creator"` and `signer-core --inspect out.jpg`.

## Manifest contents
`c2pa.created` action with `digitalSourceType = trainedAlgorithmicMedia` and `softwareAgent` = model,
`stds.schema-org.CreativeWork` (author, optional copyright), and `org.cp2a.ai_generation` (custom assertion).

## Important: certificates
`core-rust/certs/` holds a **dev-only, self-signed** chain (regenerate with `make certs`). It is not on the C2PA
trust list, so validators such as contentcredentials.org/verify will show the manifest as intact but with an
**unknown/untrusted signer**. For production badges, obtain a certificate from a C2PA-trusted CA and mount it via
`C2PA_CERT` / `C2PA_KEY`. Never use the bundled key for real provenance claims.

## ComfyUI
Copy `comfyui-node/` into `ComfyUI/custom_nodes/c2pa_sign/` and add **C2PA Sign Image** after your decode node
(needs `requests`). Set `api_url` to the running service.
