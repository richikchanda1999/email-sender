#!/usr/bin/env bash
# Bump the app version in all three manifests and create a release commit + tag.
#
# Usage:
#   ./scripts/bump-version.sh 0.1.1
#
# What it does:
#   1. Rewrites the version in package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml
#   2. Runs `cargo update -p letterpress` so Cargo.lock stays in sync
#   3. Commits the bump with message "chore(release): v<version>"
#   4. Creates annotated tag v<version>
#
# After it runs, push with:
#   git push origin main --follow-tags
#
# which triggers .github/workflows/release.yml on GitHub.

set -euo pipefail

if [ $# -ne 1 ]; then
    echo "usage: $0 <version>" >&2
    echo "  e.g. $0 0.1.1" >&2
    exit 1
fi

VERSION="$1"

# Sanity check — must be semver-ish (digits.dots, optional pre-release suffix)
if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?$ ]]; then
    echo "error: '$VERSION' doesn't look like semver (e.g. 0.1.1 or 1.0.0-rc.2)" >&2
    exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! git diff-index --quiet HEAD --; then
    echo "error: working tree has uncommitted changes; stash or commit first" >&2
    exit 1
fi

TAG="v$VERSION"
if git rev-parse "$TAG" >/dev/null 2>&1; then
    echo "error: tag $TAG already exists" >&2
    exit 1
fi

echo "==> Bumping to $VERSION"

# package.json
node -e '
  const fs = require("fs");
  const p = JSON.parse(fs.readFileSync("package.json", "utf8"));
  p.version = process.argv[1];
  fs.writeFileSync("package.json", JSON.stringify(p, null, 2) + "\n");
' "$VERSION"

# tauri.conf.json
node -e '
  const fs = require("fs");
  const p = JSON.parse(fs.readFileSync("src-tauri/tauri.conf.json", "utf8"));
  p.version = process.argv[1];
  fs.writeFileSync("src-tauri/tauri.conf.json", JSON.stringify(p, null, 2) + "\n");
' "$VERSION"

# Cargo.toml — only the first `version =` under [package].
# Using \g<1> for the group reference (not \1) avoids backslash-escape
# ambiguity with the surrounding quotes.
python3 - "$VERSION" <<'PY'
import re, sys, pathlib
version = sys.argv[1]
path = pathlib.Path("src-tauri/Cargo.toml")
text = path.read_text()
text = re.sub(
    r'^(version\s*=\s*)"[^"]+"',
    lambda m: f'{m.group(1)}"{version}"',
    text,
    count=1,
    flags=re.MULTILINE,
)
path.write_text(text)
PY

# Keep Cargo.lock in sync
(cd src-tauri && cargo update --workspace --offline 2>/dev/null || cargo update -p letterpress 2>/dev/null || true)

echo "==> Staging"
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock

echo "==> Committing"
git commit -m "chore(release): $TAG"

echo "==> Tagging $TAG"
git tag -a "$TAG" -m "Release $TAG"

echo ""
echo "Done. Push with:"
echo "    git push origin main --follow-tags"
