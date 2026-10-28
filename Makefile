.PHONY: dev build core server ui test certs clean

CORE_BIN := $(CURDIR)/core-rust/target/release/signer-core

core:
	cd core-rust && cargo build --release

build: core
	cd server-go && go build -o bin/api-server .
	cd ui-web && npm install && npm run build

# One command: builds the Rust engine, then runs Go API (:8080) and the Vite UI (:5173).
dev: core
	cd ui-web && npm install
	@trap 'kill 0' INT TERM EXIT; \
	(cd server-go && SIGNER_BIN=$(CORE_BIN) C2PA_CERT=$(CURDIR)/core-rust/certs/sample.certs C2PA_KEY=$(CURDIR)/core-rust/certs/sample.key go run .) & \
	(cd ui-web && npm run dev -- --host) & \
	wait

test:
	cd core-rust && cargo test
	cd server-go && go test ./...
	cd ui-web && npm run build

certs:
	core-rust/certs/gen.sh

clean:
	cd core-rust && cargo clean
	rm -rf server-go/bin ui-web/dist
