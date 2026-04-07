#!/bin/sh

set -e

is_executable () {
  command -v "$1" >/dev/null 2>&1
}

errcho () {
  >&2 echo "$@"
}

echo "# Installing slap..."

if ! (is_executable npm && is_executable node && is_executable git); then
  if is_executable brew; then
    brew install node git
  elif is_executable port; then
    port install nodejs git
  elif is_executable apt-get; then
    if ! is_executable curl; then
      errcho "curl not available. Please install curl first, then run this script again."
      exit 1
    fi
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs git build-essential
  elif is_executable yum; then
    if ! is_executable curl; then
      errcho "curl not available. Please install curl first, then run this script again."
      exit 1
    fi
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    sudo yum install -y nodejs git
  elif is_executable emerge; then
    emerge nodejs git
  elif is_executable pacman; then
    pacman -S nodejs npm git
  else
    errcho "Couldn't determine OS. Please install NodeJS (>=20) manually, then run this script again."
    errcho "Visit https://nodejs.org/en/download/ for instructions."
    exit 1
  fi
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ] 2>/dev/null; then
  errcho "Node.js >= 20 is required. You have $(node -v). Please upgrade."
  exit 1
fi

maybe_sudo="$([ -w "$(npm get prefix)/lib/node_modules" ] || echo 'sudo')"
$maybe_sudo npm install -g slap@latest
