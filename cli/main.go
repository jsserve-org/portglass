package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

var version = "dev"

type config struct {
	BaseURL string `json:"base_url"`
	Token   string `json:"token"`
}

type client struct {
	baseURL string
	token   string
	http    *http.Client
}

func configPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "portglass", "config.json"), nil
}

func loadConfig() (config, error) {
	path, err := configPath()
	if err != nil {
		return config{}, err
	}
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return config{BaseURL: defaultBaseURL()}, nil
	}
	if err != nil {
		return config{}, err
	}
	var cfg config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return config{}, err
	}
	if cfg.BaseURL == "" {
		cfg.BaseURL = defaultBaseURL()
	}
	return cfg, nil
}

func saveConfig(cfg config) error {
	path, err := configPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return err
	}
	data, _ := json.MarshalIndent(cfg, "", "  ")
	return os.WriteFile(path, append(data, '\n'), 0600)
}

func defaultBaseURL() string {
	if value := strings.TrimRight(os.Getenv("PORTGLASS_URL"), "/"); value != "" {
		return value
	}
	return "https://scan.2oo.dev"
}

func newClient(cfg config) client {
	return client{baseURL: strings.TrimRight(cfg.BaseURL, "/"), token: cfg.Token, http: &http.Client{Timeout: 30 * time.Second}}
}

func (c client) request(method, path string, body any) (*http.Response, error) {
	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reader = bytes.NewReader(data)
	}
	req, err := http.NewRequest(method, c.baseURL+path, reader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}
	return c.http.Do(req)
}

func responseError(res *http.Response) error {
	data, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	var body struct {
		Error string `json:"error"`
	}
	_ = json.Unmarshal(data, &body)
	if body.Error != "" {
		return errors.New(body.Error)
	}
	return fmt.Errorf("Portglass returned HTTP %d", res.StatusCode)
}

func requireToken(cfg config) error {
	if cfg.Token == "" {
		return errors.New("not logged in; run `portglass login` first")
	}
	return nil
}

func openBrowser(url string) error {
	var command string
	var args []string
	switch runtime.GOOS {
	case "darwin":
		command, args = "open", []string{url}
	case "windows":
		command, args = "rundll32", []string{"url.dll,FileProtocolHandler", url}
	default:
		command, args = "xdg-open", []string{url}
	}
	return exec.Command(command, args...).Start()
}

func login(cfg config, args []string) error {
	fs := flag.NewFlagSet("login", flag.ContinueOnError)
	name, _ := os.Hostname()
	deviceName := fs.String("name", name, "device name shown on the website")
	baseURL := fs.String("url", cfg.BaseURL, "Portglass server URL")
	if err := fs.Parse(args); err != nil {
		return err
	}
	c := newClient(config{BaseURL: *baseURL})
	var start struct {
		DeviceCode              string `json:"deviceCode"`
		UserCode                string `json:"userCode"`
		VerificationURIComplete string `json:"verificationUriComplete"`
		ExpiresIn               int    `json:"expiresIn"`
		Interval                int    `json:"interval"`
	}
	res, err := c.request(http.MethodPost, "/api/cli/device/start", map[string]any{
		"name": *deviceName, "platform": runtime.GOOS + "/" + runtime.GOARCH,
	})
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return responseError(res)
	}
	if err := json.NewDecoder(res.Body).Decode(&start); err != nil {
		return err
	}

	fmt.Printf("Open this URL to link %q:\n\n  %s\n\nCode: %s\n", *deviceName, start.VerificationURIComplete, start.UserCode)
	if err := openBrowser(start.VerificationURIComplete); err == nil {
		fmt.Println("\nOpened your browser.")
	}
	fmt.Print("Waiting for approval")
	deadline := time.Now().Add(time.Duration(start.ExpiresIn) * time.Second)
	interval := time.Duration(start.Interval) * time.Second
	if interval < 2*time.Second {
		interval = 2 * time.Second
	}
	for time.Now().Before(deadline) {
		time.Sleep(interval)
		poll, err := c.request(http.MethodPost, "/api/cli/device/poll", map[string]string{"deviceCode": start.DeviceCode})
		if err != nil {
			return err
		}
		if poll.StatusCode == 428 {
			poll.Body.Close()
			fmt.Print(".")
			continue
		}
		if poll.StatusCode != http.StatusOK {
			defer poll.Body.Close()
			return responseError(poll)
		}
		var token struct {
			AccessToken string `json:"accessToken"`
		}
		err = json.NewDecoder(poll.Body).Decode(&token)
		poll.Body.Close()
		if err != nil {
			return err
		}
		cfg.BaseURL, cfg.Token = strings.TrimRight(*baseURL, "/"), token.AccessToken
		if err := saveConfig(cfg); err != nil {
			return err
		}
		fmt.Println("\nLinked. Credentials saved with user-only permissions.")
		return nil
	}
	return errors.New("device code expired; run `portglass login` again")
}

func activate(cfg config, args []string) error {
	if err := requireToken(cfg); err != nil {
		return err
	}
	fs := flag.NewFlagSet("activate", flag.ContinueOnError)
	ports := fs.String("ports", "common", "ports: common, top100, all, or comma/ranges")
	fs.StringVar(ports, "p", "common", "ports (shorthand)")
	label := fs.String("label", "", "scan label")
	banner := fs.Bool("banner", false, "collect small service banners")
	deep := fs.Bool("deep", false, "enable careful verification and banners")
	fast := fs.Bool("fast", false, "disable banners and retries")
	dynamic := fs.Bool("dynamic", false, "use dynamic service discovery")
	rate := fs.Float64("rate", 300, "maximum connection attempts per second")
	exclude := fs.String("exclude", "", "CIDRs to exclude")
	excludePorts := fs.String("exclude-ports", "", "ports/ranges to exclude")
	// Accept the natural `activate CIDR --flags` form even though Go's standard
	// flag package normally stops parsing at the first positional argument.
	target := ""
	if len(args) > 0 && !strings.HasPrefix(args[0], "-") {
		target, args = args[0], args[1:]
	}
	if err := fs.Parse(args); err != nil {
		return err
	}
	if target == "" && fs.NArg() == 1 {
		target = fs.Arg(0)
	}
	if target == "" || fs.NArg() > 1 {
		return errors.New("usage: portglass activate <CIDR> [options]")
	}
	payload := map[string]any{
		"cidr": target, "ports": *ports, "label": *label, "banner": *banner,
		"deep": *deep, "fast": *fast, "dynamic": *dynamic, "rate": *rate,
		"exclude": *exclude, "excludePorts": *excludePorts,
	}
	res, err := newClient(cfg).request(http.MethodPost, "/api/cli/scans", payload)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusAccepted {
		return responseError(res)
	}
	var result struct {
		RunID  int    `json:"runId"`
		Status string `json:"status"`
	}
	if err := json.NewDecoder(res.Body).Decode(&result); err != nil {
		return err
	}
	fmt.Printf("Scan %d %s.\n", result.RunID, result.Status)
	fmt.Printf("Track it: portglass status %d\n", result.RunID)
	return nil
}

func listScans(cfg config) error {
	if err := requireToken(cfg); err != nil {
		return err
	}
	res, err := newClient(cfg).request(http.MethodGet, "/api/cli/scans", nil)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return responseError(res)
	}
	var scans []struct {
		ID                  int `json:"id"`
		CIDR, Ports, Status string
		StartedAt           time.Time `json:"startedAt"`
		OpenCount           *int      `json:"openCount"`
	}
	if err := json.NewDecoder(res.Body).Decode(&scans); err != nil {
		return err
	}
	fmt.Printf("%-7s %-11s %-24s %-16s %s\n", "ID", "STATUS", "TARGET", "PORTS", "STARTED")
	for _, scan := range scans {
		fmt.Printf("%-7d %-11s %-24s %-16s %s\n", scan.ID, scan.Status, scan.CIDR, scan.Ports, scan.StartedAt.Local().Format("2006-01-02 15:04"))
	}
	return nil
}

func status(cfg config, args []string) error {
	if err := requireToken(cfg); err != nil {
		return err
	}
	if len(args) != 1 {
		return errors.New("usage: portglass status <scan-id>")
	}
	id, err := strconv.Atoi(args[0])
	if err != nil {
		return errors.New("scan ID must be a number")
	}
	res, err := newClient(cfg).request(http.MethodGet, fmt.Sprintf("/api/cli/scans/%d", id), nil)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return responseError(res)
	}
	var value map[string]any
	if err := json.NewDecoder(res.Body).Decode(&value); err != nil {
		return err
	}
	fmt.Printf("Scan:     %d\nTarget:   %v\nPorts:    %v\nStatus:   %v\nProgress: %v / %v attempts\nFindings: %v\n", id, value["cidr"], value["ports"], value["status"], value["attemptedTargets"], value["totalTargets"], value["findingsCount"])
	return nil
}

func download(cfg config, args []string) error {
	if err := requireToken(cfg); err != nil {
		return err
	}
	fs := flag.NewFlagSet("download", flag.ContinueOnError)
	format := fs.String("format", "csv", "csv or json")
	output := fs.String("output", "", "destination filename")
	scanID := ""
	if len(args) > 0 && !strings.HasPrefix(args[0], "-") {
		scanID, args = args[0], args[1:]
	}
	if err := fs.Parse(args); err != nil {
		return err
	}
	if scanID == "" && fs.NArg() == 1 {
		scanID = fs.Arg(0)
	}
	if scanID == "" || fs.NArg() > 1 {
		return errors.New("usage: portglass download <scan-id> [--format csv|json]")
	}
	id, err := strconv.Atoi(scanID)
	if err != nil {
		return errors.New("scan ID must be a number")
	}
	if *format != "csv" && *format != "json" {
		return errors.New("format must be csv or json")
	}
	if *output == "" {
		*output = fmt.Sprintf("portglass-scan-%d.%s", id, *format)
	}
	res, err := newClient(cfg).request(http.MethodGet, fmt.Sprintf("/api/cli/scans/%d/download?format=%s", id, *format), nil)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return responseError(res)
	}
	file, err := os.OpenFile(*output, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(file, res.Body)
	closeErr := file.Close()
	if copyErr != nil {
		return copyErr
	}
	if closeErr != nil {
		return closeErr
	}
	fmt.Println("Saved", *output)
	return nil
}

func whoami(cfg config) error {
	if err := requireToken(cfg); err != nil {
		return err
	}
	res, err := newClient(cfg).request(http.MethodGet, "/api/cli/me", nil)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return responseError(res)
	}
	var value struct{ DeviceID, UserID, Name, Platform string }
	if err := json.NewDecoder(res.Body).Decode(&value); err != nil {
		return err
	}
	fmt.Printf("Device:   %s\nPlatform: %s\nServer:   %s\nID:       %s\n", value.Name, value.Platform, cfg.BaseURL, value.DeviceID)
	return nil
}

func usage() {
	fmt.Printf(`Portglass CLI %s — authorized remote network scanning

Usage:
  portglass login [--name NAME] [--url URL]
  portglass activate <CIDR> [-p PORTS] [--label TEXT] [--banner|--deep|--fast]
  portglass scans
  portglass status <SCAN-ID>
  portglass download <SCAN-ID> [--format csv|json] [--output FILE]
  portglass whoami
  portglass logout
  portglass version

Only scan networks you own or are explicitly authorized to assess.
`, version)
}

func run() error {
	cfg, err := loadConfig()
	if err != nil {
		return err
	}
	if len(os.Args) < 2 {
		usage()
		return nil
	}
	command, args := os.Args[1], os.Args[2:]
	switch command {
	case "login":
		return login(cfg, args)
	case "activate", "scan":
		return activate(cfg, args)
	case "scans", "list":
		return listScans(cfg)
	case "status":
		return status(cfg, args)
	case "download":
		return download(cfg, args)
	case "whoami":
		return whoami(cfg)
	case "logout":
		cfg.Token = ""
		if err := saveConfig(cfg); err != nil {
			return err
		}
		fmt.Println("Logged out locally. Revoke the device on the website to invalidate its token.")
		return nil
	case "version", "--version", "-v":
		fmt.Println("portglass", version)
		return nil
	case "help", "--help", "-h":
		usage()
		return nil
	default:
		usage()
		return fmt.Errorf("unknown command %q", command)
	}
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}
