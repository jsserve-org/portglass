const SCRIPT = `#!/bin/sh
set -eu

REPO="jsserve-org/portglass"
TAG="cli-latest"
OS=$(uname -s)
ARCH=$(uname -m)

case "$OS" in
  Darwin) OS=darwin ;;
  Linux) OS=linux ;;
  *) echo "Unsupported operating system: $OS" >&2; exit 1 ;;
esac

case "$ARCH" in
  x86_64|amd64) ARCH=amd64 ;;
  arm64|aarch64) ARCH=arm64 ;;
  *) echo "Unsupported CPU architecture: $ARCH" >&2; exit 1 ;;
esac

ASSET="portglass_\${OS}_\${ARCH}.tar.gz"
URL="https://github.com/\${REPO}/releases/download/\${TAG}/\${ASSET}"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT INT TERM

echo "Downloading Portglass CLI for $OS/$ARCH..."
curl -fL --retry 3 -o "$TMP/$ASSET" "$URL"
curl -fL --retry 3 -o "$TMP/checksums.txt" "https://github.com/\${REPO}/releases/download/\${TAG}/checksums.txt"
(cd "$TMP" && grep "  $ASSET$" checksums.txt | sha256sum -c - 2>/dev/null) || {
  if command -v shasum >/dev/null 2>&1; then
    EXPECTED=$(grep "  $ASSET$" "$TMP/checksums.txt" | awk '{print $1}')
    ACTUAL=$(shasum -a 256 "$TMP/$ASSET" | awk '{print $1}')
    [ "$EXPECTED" = "$ACTUAL" ] || { echo "Checksum verification failed" >&2; exit 1; }
  else
    echo "No SHA-256 tool found; refusing unverified install" >&2; exit 1
  fi
}
tar -xzf "$TMP/$ASSET" -C "$TMP"

DEST=/usr/local/bin
if [ ! -w "$DEST" ]; then
  DEST="$HOME/.local/bin"
  mkdir -p "$DEST"
fi
install -m 0755 "$TMP/portglass" "$DEST/portglass"
echo "Installed Portglass CLI to $DEST/portglass"
case ":$PATH:" in *":$DEST:"*) ;; *) echo "Add $DEST to PATH, then run: portglass login" ;; esac
`;

export function GET() {
  return new Response(SCRIPT, {
    headers: {
      'Content-Type': 'text/x-shellscript; charset=utf-8',
      'Content-Disposition': 'inline; filename="install.sh"',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
