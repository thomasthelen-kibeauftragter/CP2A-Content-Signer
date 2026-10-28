package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
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

// credentials resolves the signing certificate chain and key. Precedence:
// C2PA_CERT_PEM / C2PA_KEY_PEM (PEM contents, e.g. from a secret manager; written to 0600 temp files),
// then C2PA_CERT / C2PA_KEY (file paths, e.g. a mounted volume), then the bundled DEV certificate.
func credentials() (cert, key string, dev bool) {
	cert, key = env("C2PA_CERT", "certs/sample.certs"), env("C2PA_KEY", "certs/sample.key")
	certPEM, keyPEM := os.Getenv("C2PA_CERT_PEM"), os.Getenv("C2PA_KEY_PEM")
	if certPEM != "" || keyPEM != "" {
		if certPEM == "" || keyPEM == "" {
			log.Fatal("C2PA_CERT_PEM and C2PA_KEY_PEM must be set together")
		}
		dir, err := os.MkdirTemp("", "c2pa-creds-")
		if err != nil {
			log.Fatal(err)
		}
		cert, key = filepath.Join(dir, "cert.pem"), filepath.Join(dir, "key.pem")
		if err := os.WriteFile(cert, []byte(certPEM), 0o600); err != nil {
			log.Fatal(err)
		}
		if err := os.WriteFile(key, []byte(keyPEM), 0o600); err != nil {
			log.Fatal(err)
		}
		return cert, key, false
	}
	dev = os.Getenv("C2PA_CERT") == "" && os.Getenv("C2PA_KEY") == ""
	return cert, key, dev
}

func main() {
	cert, key, dev := credentials()
	for _, p := range []string{cert, key} {
		if _, err := os.Stat(p); err != nil {
			log.Fatalf("signing credential not readable: %v", err)
		}
	}
	if dev {
		log.Print("WARNING: using the bundled DEV certificate; signatures will be untrusted. Set C2PA_CERT/C2PA_KEY for production.")
	}
	runner := &ExecRunner{Bin: env("SIGNER_BIN", "signer-core"), Cert: cert, Key: key}
	srv := NewServer(runner, Config{
		MaxUploadBytes: int64(envInt("MAX_UPLOAD_MB", 25)) << 20,
		Workers:        envInt("WORKERS", 4),
		RatePerMinute:  envInt("RATE_LIMIT_PER_MIN", 60),
		Timeout:        time.Duration(envInt("SIGN_TIMEOUT_SEC", 30)) * time.Second,
		StaticDir:      os.Getenv("STATIC_DIR"),
		APIKey:         os.Getenv("API_KEY"),
		TrustProxy:     os.Getenv("TRUST_PROXY") == "true",
	})
	addr := env("ADDR", ":"+env("PORT", "8080"))
	log.Printf("api-server listening on %s (signer=%s)", addr, runner.Bin)
	log.Fatal((&http.Server{Addr: addr, Handler: srv.Handler(), ReadHeaderTimeout: 10 * time.Second}).ListenAndServe())
}
