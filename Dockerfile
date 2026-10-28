# syntax=docker/dockerfile:1
FROM rust:1-bookworm AS rust
WORKDIR /src
COPY core-rust/ .
RUN cargo build --release

FROM golang:1.24-bookworm AS go
WORKDIR /src
COPY server-go/ .
RUN CGO_ENABLED=0 go build -o /api-server .

FROM node:22-bookworm-slim AS ui
WORKDIR /src
COPY ui-web/package*.json ./
RUN npm ci
COPY ui-web/ .
RUN npm run build

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* \
 && useradd -r -u 10001 signer
COPY --from=rust /src/target/release/signer-core /usr/local/bin/signer-core
COPY --from=go /api-server /usr/local/bin/api-server
COPY --from=ui /src/dist /srv/ui
WORKDIR /app
# DEV fallback (relative default paths). Override with C2PA_CERT_PEM/C2PA_KEY_PEM or C2PA_CERT/C2PA_KEY.
COPY core-rust/certs/sample.certs core-rust/certs/sample.key /app/certs/
ENV STATIC_DIR=/srv/ui PORT=8080 TRUST_PROXY=true
USER signer
EXPOSE 8080
CMD ["api-server"]
