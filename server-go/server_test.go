package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"
)

type fakeRunner struct{ got SignRequest }

func (f *fakeRunner) Sign(_ context.Context, r SignRequest) (json.RawMessage, error) {
	f.got = r
	in, _ := os.ReadFile(r.In)
	return json.RawMessage(`{"ok":true}`), os.WriteFile(r.Out, append(in, []byte("SIGNED")...), 0o600)
}
func (f *fakeRunner) Inspect(context.Context, string) (json.RawMessage, error) {
	return json.RawMessage(`{"ok":true,"manifest":{}}`), nil
}

// 1x1 PNG
var png = []byte("\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89")

func newTestServer(rate int) (*httptest.Server, *fakeRunner) {
	fr := &fakeRunner{}
	s := NewServer(fr, Config{MaxUploadBytes: 1 << 20, Workers: 2, RatePerMinute: rate, Timeout: 5 * time.Second})
	return httptest.NewServer(s.Handler()), fr
}

func post(t *testing.T, url string, file []byte, fields map[string]string) *http.Response {
	t.Helper()
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	if file != nil {
		fw, _ := mw.CreateFormFile("image", "x.png")
		fw.Write(file)
	}
	for k, v := range fields {
		mw.WriteField(k, v)
	}
	mw.Close()
	resp, err := http.Post(url, mw.FormDataContentType(), &buf)
	if err != nil {
		t.Fatal(err)
	}
	return resp
}

func TestSignReturnsSignedBinary(t *testing.T) {
	ts, fr := newTestServer(100)
	defer ts.Close()
	resp := post(t, ts.URL+"/api/v1/sign", png, map[string]string{"model_name": "FLUX.1", "creator": "Ada"})
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("status %d", resp.StatusCode)
	}
	var body bytes.Buffer
	body.ReadFrom(resp.Body)
	if !bytes.HasSuffix(body.Bytes(), []byte("SIGNED")) || !bytes.HasPrefix(body.Bytes(), png) {
		t.Fatal("response is not the signer output")
	}
	if resp.Header.Get("Content-Type") != "image/png" || fr.got.Model != "FLUX.1" || fr.got.Author != "Ada" {
		t.Fatalf("bad header/args: %v %+v", resp.Header, fr.got)
	}
}

func TestIconOptions(t *testing.T) {
	ts, fr := newTestServer(100)
	defer ts.Close()
	resp := post(t, ts.URL+"/api/v1/sign", png, map[string]string{"model_name": "m", "creator": "c",
		"icon": "generated", "icon_position": "top-left", "icon_color": "white", "icon_opacity": "50"})
	resp.Body.Close()
	if resp.StatusCode != 200 || fr.got.Icon != (IconOptions{"generated", "top-left", "white", "medium", "50"}) {
		t.Fatalf("status %d icon %+v", resp.StatusCode, fr.got.Icon)
	}
	for _, bad := range []map[string]string{{"icon": "evil"}, {"icon": "basic", "icon_position": "middle"}, {"icon": "basic", "icon_opacity": "7"}} {
		bad["model_name"], bad["creator"] = "m", "c"
		r := post(t, ts.URL+"/api/v1/sign", png, bad)
		r.Body.Close()
		if r.StatusCode != 400 {
			t.Errorf("%v: status %d, want 400", bad, r.StatusCode)
		}
	}
}

func TestSignValidation(t *testing.T) {
	ts, _ := newTestServer(100)
	defer ts.Close()
	for name, c := range map[string]struct {
		file   []byte
		fields map[string]string
	}{
		"no file":      {nil, map[string]string{"model_name": "m", "creator": "c"}},
		"not an image": {[]byte("hello world"), map[string]string{"model_name": "m", "creator": "c"}},
		"no metadata":  {png, nil},
	} {
		resp := post(t, ts.URL+"/api/v1/sign", c.file, c.fields)
		resp.Body.Close()
		if resp.StatusCode != 400 {
			t.Errorf("%s: status %d, want 400", name, resp.StatusCode)
		}
	}
}

func TestInspectAndHealthAndRateLimit(t *testing.T) {
	ts, _ := newTestServer(2)
	defer ts.Close()
	if r, _ := http.Get(ts.URL + "/health"); r.StatusCode != 200 {
		t.Fatal("health")
	}
	var codes []int
	for i := 0; i < 3; i++ {
		r := post(t, ts.URL+"/api/v1/inspect", png, nil)
		r.Body.Close()
		codes = append(codes, r.StatusCode)
	}
	if codes[0] != 200 || codes[2] != 429 {
		t.Fatalf("codes %v", codes)
	}
}

func TestAPIKey(t *testing.T) {
	s := NewServer(&fakeRunner{}, Config{MaxUploadBytes: 1 << 20, Workers: 1, RatePerMinute: 100, Timeout: time.Second, APIKey: "secret"})
	ts := httptest.NewServer(s.Handler())
	defer ts.Close()
	r := post(t, ts.URL+"/api/v1/inspect", png, nil)
	r.Body.Close()
	if r.StatusCode != 401 {
		t.Fatalf("want 401, got %d", r.StatusCode)
	}
	req, _ := http.NewRequest("POST", ts.URL+"/api/v1/inspect", nil)
	req.Header.Set("Authorization", "Bearer secret")
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	fw, _ := mw.CreateFormFile("image", "x.png")
	fw.Write(png)
	mw.Close()
	req.Body = io.NopCloser(&buf)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	resp, _ := http.DefaultClient.Do(req)
	resp.Body.Close()
	if resp.StatusCode != 200 {
		t.Fatalf("want 200 with key, got %d", resp.StatusCode)
	}
}
