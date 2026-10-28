package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
)

// SignRequest holds metadata for one signing job. Paths point at files in a job-private temp dir.
type SignRequest struct {
	In, Out, Model, Author, Copyright, Prompt string
	Icon                                      IconOptions // zero value = no visible label
}

// IconOptions selects the EU AI label burned into the image. Values are validated by ParseIconOptions.
type IconOptions struct{ Name, Position, Color, Size, Opacity string }

// Runner abstracts the Rust engine so the HTTP layer can be tested without it.
type Runner interface {
	Sign(ctx context.Context, r SignRequest) (json.RawMessage, error)
	Inspect(ctx context.Context, path string) (json.RawMessage, error)
}

// ExecRunner invokes the signer-core binary as a subprocess.
type ExecRunner struct{ Bin, Cert, Key string }

func (e *ExecRunner) Sign(ctx context.Context, r SignRequest) (json.RawMessage, error) {
	args := []string{"--input", r.In, "--output", r.Out, "--model", r.Model, "--author", r.Author,
		"--cert", e.Cert, "--key", e.Key}
	if r.Copyright != "" {
		args = append(args, "--copyright", r.Copyright)
	}
	if r.Prompt != "" {
		args = append(args, "--prompt", r.Prompt)
	}
	if i := r.Icon; i.Name != "" {
		args = append(args, "--icon", i.Name, "--icon-position", i.Position, "--icon-color", i.Color,
			"--icon-size", i.Size, "--icon-opacity", i.Opacity)
	}
	return e.run(ctx, args)
}

func (e *ExecRunner) Inspect(ctx context.Context, path string) (json.RawMessage, error) {
	return e.run(ctx, []string{"--inspect", path})
}

func (e *ExecRunner) run(ctx context.Context, args []string) (json.RawMessage, error) {
	cmd := exec.CommandContext(ctx, e.Bin, args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	if err := cmd.Run(); err != nil {
		var msg struct{ Error string }
		if json.Unmarshal(stderr.Bytes(), &msg) == nil && msg.Error != "" {
			return nil, errors.New(msg.Error)
		}
		return nil, fmt.Errorf("signer-core failed: %w", err)
	}
	return json.RawMessage(bytes.TrimSpace(stdout.Bytes())), nil
}
