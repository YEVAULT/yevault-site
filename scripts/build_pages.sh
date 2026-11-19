#!/usr/bin/env bash
set -euo pipefail

mkdir _site
cp index.html album-copies.html _site/
cp -R assets _site/assets
mkdir _site/contact
cp contact/index.html _site/contact/
test -s _site/contact/index.html

mkdir _site/version
cp version/index.html _site/version/
test -s _site/version/index.html
