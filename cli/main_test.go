package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestActivateAcceptsTargetBeforeFlags(t *testing.T) {
	var body map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/cli/scans" {
			t.Errorf("path = %s", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer pgc_test" {
			t.Errorf("authorization = %q", got)
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"runId":42,"status":"queued"}`))
	}))
	defer server.Close()

	err := activate(config{BaseURL: server.URL, Token: "pgc_test"}, []string{"192.0.2.0/28", "-p", "22,443", "--label", "edge"})
	if err != nil {
		t.Fatal(err)
	}
	if body["cidr"] != "192.0.2.0/28" {
		t.Errorf("cidr = %#v", body["cidr"])
	}
	if body["ports"] != "22,443" {
		t.Errorf("ports = %#v", body["ports"])
	}
	if body["label"] != "edge" {
		t.Errorf("label = %#v", body["label"])
	}
}

func TestDownloadAcceptsIDBeforeFlags(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/cli/scans/42/download" {
			t.Errorf("path = %s", r.URL.Path)
		}
		if got := r.URL.Query().Get("format"); got != "json" {
			t.Errorf("format = %q", got)
		}
		_, _ = w.Write([]byte(`{"run":{"id":42},"findings":[]}`))
	}))
	defer server.Close()

	output := filepath.Join(t.TempDir(), "result.json")
	err := download(config{BaseURL: server.URL, Token: "pgc_test"}, []string{"42", "--format", "json", "--output", output})
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(output)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != `{"run":{"id":42},"findings":[]}` {
		t.Errorf("data = %s", data)
	}
}

func TestCommandsRequireLogin(t *testing.T) {
	if err := activate(config{BaseURL: "https://example.invalid"}, []string{"192.0.2.1/32"}); err == nil {
		t.Fatal("activate succeeded without a token")
	}
	if err := listScans(config{BaseURL: "https://example.invalid"}); err == nil {
		t.Fatal("list succeeded without a token")
	}
}
