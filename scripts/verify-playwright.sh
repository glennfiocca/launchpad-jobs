#!/usr/bin/env bash
# verify-playwright.sh
#
# Verifies that Playwright's bundled Chromium can launch in the current
# environment.  Run this after deploying to a new machine or CI runner
# to confirm all system libraries (libnspr4, libnss3, etc.) are present.
#
# Usage:
#   bash scripts/verify-playwright.sh
#
# If Chromium fails to start you will see an error like:
#   error while loading shared libraries: libnspr4.so: cannot open shared object file
#
# Fix (Debian/Ubuntu):
#   npx playwright install --with-deps chromium
#
# Fix (minimal apt — if npm/npx unavailable):
#   apt-get install -y libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 \
#     libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
#     libgbm1 libasound2 libcups2 libdbus-1-3 libxss1 libx11-xcb1

set -euo pipefail

echo "==> Playwright system dependency check"
echo "    NODE_ENV:                ${NODE_ENV:-unset}"
echo "    PLAYWRIGHT_BROWSERS_PATH: ${PLAYWRIGHT_BROWSERS_PATH:-default}"

# Quick launch test using Node
node - <<'EOF'
const { chromium } = require('playwright');

(async () => {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
      ],
    });
    const version = browser.version();
    await browser.close();
    console.log(`✓ Chromium launched successfully (${version})`);
    process.exit(0);
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error('✗ Chromium launch failed:', err.message);
    if (err.message.includes('libnspr4') || err.message.includes('shared libraries')) {
      console.error('');
      console.error('Fix: run  npx playwright install --with-deps chromium');
      console.error('     or install the apt packages listed at the top of this script.');
    }
    process.exit(1);
  }
})();
EOF
