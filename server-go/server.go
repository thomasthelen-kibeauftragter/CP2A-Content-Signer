package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"log"
	"mime/multipart"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type Config struct {
	MaxUploadBytes int64
	Workers        int
	RatePerMinute  int
	Timeout        time.Duration
	StaticDir      string
	APIKey         string // if set, /api/v1/* requires it (Bearer or X-API-Key)
	TrustProxy     bool   // use X-Forwarded-For for rate limiting (behind a reverse proxy)
}

type Server struct {
	runner Runner
	cfg    Config
	sem    chan struct{} // bounds concurrent signer subprocesses
	rl     *rateLimiter
}

func NewServer(r Runner, cfg Config) *Server {
	return &Server{runner: r, cfg: cfg, sem: make(chan struct{}, cfg.Workers), rl: newRateLimiter(cfg.RatePerMinute)}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("POST /api/v1/sign", s.limited(s.handleSign))
	mux.HandleFunc("POST /api/v1/inspect", s.limited(s.handleInspect))
	if s.cfg.StaticDir != "" {
		mux.Handle("/", http.FileServer(http.Dir(s.cfg.StaticDir)))
	}
	return mux
}

func (s *Server) limited(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if s.cfg.APIKey != "" && !s.authorized(r) {
			writeErr(w, http.StatusUnauthorized, "missing or invalid API key")
			return
		}
		if !s.rl.allow(s.clientIP(r)) {
			writeErr(w, http.StatusTooManyRequests, "rate limit exceeded")
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, s.cfg.MaxUploadBytes)
		h(w, r)
	}
}

var extByType = map[string]string{"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}

// saveUpload stores the "image" form file in dir after sniffing its real type (the client's name/type is not trusted).
func saveUpload(r *http.Request, dir string) (path, ext string, err error) {
	if err = r.ParseMultipartForm(8 << 20); err != nil {
		return "", "", errors.New("invalid multipart upload (or file too large)")
	}
	var f multipart.File
	if f, _, err = r.FormFile("image"); err != nil {
		return "", "", errors.New(`missing form file "image"`)
	}
	defer f.Close()
	head := make([]byte, 512)
	n, _ := io.ReadFull(f, head)
	ext = extByType[http.DetectContentType(head[:n])]
	if ext == "" {
		return "", "", errors.New("unsupported image type (JPEG, PNG or WebP only)")
	}
	if _, err = f.Seek(0, io.SeekStart); err != nil {
		return "", "", err
	}
	path = filepath.Join(dir, "in"+ext)
	out, err := os.Create(path)
	if err != nil {
		return "", "", err
	}
	defer out.Close()
	_, err = io.Copy(out, f)
	return path, ext, err
}

func (s *Server) acquire(ctx context.Context) (func(), error) {
	select {
	case s.sem <- struct{}{}:
		return func() { <-s.sem }, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func oneOf(v, def string, allowed ...string) (string, error) {
	if v == "" {
		return def, nil
	}
	for _, a := range allowed {
		if v == a {
			return v, nil
		}
	}
	return "", errors.New("invalid value: " + v)
}

// ParseIconOptions validates the icon_* form fields. Empty icon (or "none") means no visible label.
func ParseIconOptions(get func(string) string) (IconOptions, error) {
	name := get("icon")
	if name == "" || name == "none" {
		return IconOptions{}, nil
	}
	var o IconOptions
	var err error
	if o.Name, err = oneOf(name, "", "basic", "generated", "modified"); err != nil {
		return o, errors.New("invalid icon")
	}
	if o.Position, err = oneOf(get("icon_position"), "bottom-right", "top-left", "top-center", "top-right",
		"bottom-left", "bottom-center", "bottom-right"); err != nil {
		return o, errors.New("invalid icon_position")
	}
	if o.Color, err = oneOf(get("icon_color"), "black", "black", "white"); err != nil {
		return o, errors.New("invalid icon_color")
	}
	if o.Size, err = oneOf(get("icon_size"), "medium", "small", "medium", "large"); err != nil {
		return o, errors.New("invalid icon_size")
	}
	if o.Opacity, err = oneOf(get("icon_opacity"), "100", "100", "50"); err != nil {
		return o, errors.New("invalid icon_opacity")
	}
	return o, nil
}

func (s *Server) handleSign(w http.ResponseWriter, r *http.Request) {
	dir, err := os.MkdirTemp("", "sign-")
	if err != nil {
		writeErr(w, 500, "internal error")
		return
	}
	defer os.RemoveAll(dir)
	in, ext, err := saveUpload(r, dir)
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	model, creator := strings.TrimSpace(r.FormValue("model_name")), strings.TrimSpace(r.FormValue("creator"))
	if model == "" || creator == "" {
		writeErr(w, 400, "model_name and creator are required")
		return
	}
	icon, err := ParseIconOptions(r.FormValue)
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.cfg.Timeout)
	defer cancel()
	release, err := s.acquire(ctx)
	if err != nil {
		writeErr(w, 503, "server busy, try again")
		return
	}
	defer release()

	out := filepath.Join(dir, "out"+ext)
	_, err = s.runner.Sign(ctx, SignRequest{In: in, Out: out, Model: model, Author: creator,
		Copyright: r.FormValue("copyright"), Prompt: r.FormValue("prompt_optional"), Icon: icon})
	if err != nil {
		log.Printf("sign failed: %v", err)
		writeErr(w, 422, err.Error())
		return
	}
	f, err := os.Open(out)
	if err != nil {
		writeErr(w, 500, "signed file missing")
		return
	}
	defer f.Close()
	st, _ := f.Stat()
	w.Header().Set("Content-Type", http.DetectContentType(mustHead(f)))
	w.Header().Set("Content-Disposition", `attachment; filename="signed`+ext+`"`)
	http.ServeContent(w, r, "", st.ModTime(), f)
}

func mustHead(f *os.File) []byte {
	b := make([]byte, 512)
	n, _ := f.ReadAt(b, 0)
	return b[:n]
}

func (s *Server) handleInspect(w http.ResponseWriter, r *http.Request) {
	dir, err := os.MkdirTemp("", "inspect-")
	if err != nil {
		writeErr(w, 500, "internal error")
		return
	}
	defer os.RemoveAll(dir)
	in, _, err := saveUpload(r, dir)
	if err != nil {
		writeErr(w, 400, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), s.cfg.Timeout)
	defer cancel()
	release, err := s.acquire(ctx)
	if err != nil {
		writeErr(w, 503, "server busy, try again")
		return
	}
	defer release()
	res, err := s.runner.Inspect(ctx, in)
	if err != nil {
		writeErr(w, 422, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(res)
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]any{"ok": false, "error": msg})
}

func (s *Server) authorized(r *http.Request) bool {
	key := r.Header.Get("X-API-Key")
	if k, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer "); ok {
		key = k
	}
	return subtle.ConstantTimeCompare([]byte(key), []byte(s.cfg.APIKey)) == 1
}

func (s *Server) clientIP(r *http.Request) string {
	if s.cfg.TrustProxy {
		// last entry is the one appended by our own proxy; earlier ones are client-controlled
		parts := strings.Split(r.Header.Get("X-Forwarded-For"), ",")
		if ip := strings.TrimSpace(parts[len(parts)-1]); ip != "" {
			return ip
		}
	}
	h, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return h
}

// rateLimiter is a per-IP fixed-window counter.
type rateLimiter struct {
	mu     sync.Mutex
	limit  int
	window map[string]*struct {
		start time.Time
		n     int
	}
}

func newRateLimiter(perMin int) *rateLimiter {
	return &rateLimiter{limit: perMin, window: map[string]*struct {
		start time.Time
		n     int
	}{}}
}

func (l *rateLimiter) allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	e := l.window[ip]
	if e == nil || now.Sub(e.start) >= time.Minute {
		for k, v := range l.window { // opportunistic cleanup
			if now.Sub(v.start) >= time.Minute {
				delete(l.window, k)
			}
		}
		l.window[ip] = &struct {
			start time.Time
			n     int
		}{now, 1}
		return true
	}
	e.n++
	return e.n <= l.limit
}
