package main

import (
	"log"
	"net/http"
	"os"
	"strconv"
	"time"
)

func env(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func envInt(k string, d int) int {
	if n, err := strconv.Atoi(os.Getenv(k)); err == nil && n > 0 {
		return n
	}
	return d
}

func main() {
	runner := &ExecRunner{
		Bin:  env("SIGNER_BIN", "signer-core"),
		Cert: env("C2PA_CERT", "certs/sample.certs"),
		Key:  env("C2PA_KEY", "certs/sample.key"),
	}
	srv := NewServer(runner, Config{
		MaxUploadBytes: int64(envInt("MAX_UPLOAD_MB", 25)) << 20,
		Workers:        envInt("WORKERS", 4),
		RatePerMinute:  envInt("RATE_LIMIT_PER_MIN", 60),
		Timeout:        time.Duration(envInt("SIGN_TIMEOUT_SEC", 30)) * time.Second,
		StaticDir:      os.Getenv("STATIC_DIR"),
	})
	addr := env("ADDR", ":8080")
	log.Printf("api-server listening on %s (signer=%s)", addr, runner.Bin)
	log.Fatal((&http.Server{Addr: addr, Handler: srv.Handler(), ReadHeaderTimeout: 10 * time.Second}).ListenAndServe())
}
