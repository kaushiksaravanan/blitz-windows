#!/usr/bin/env bash
# App Store Connect API - Create Provisioning Profile
# Reads credentials from ~/.blitz/mcp4/asc-credentials.json

set -euo pipefail

CREDS_FILE="$HOME/.blitz/asc-credentials.json"

KEY_ID=$(node -e "const d=require('$CREDS_FILE'); process.stdout.write(d.keyId)")
ISSUER_ID=$(node -e "const d=require('$CREDS_FILE'); process.stdout.write(d.issuerId)")
PRIVATE_KEY=$(node -e "const d=require('$CREDS_FILE'); process.stdout.write(d.privateKey)")

# Generate JWT using Node.js built-in crypto
generate_jwt() {
node - <<JSEOF
const crypto = require('crypto');

const keyId = $(node -e "const d=require('$CREDS_FILE'); process.stdout.write(JSON.stringify(d.keyId))");
const issuerId = $(node -e "const d=require('$CREDS_FILE'); process.stdout.write(JSON.stringify(d.issuerId))");
const privateKey = $(node -e "const d=require('$CREDS_FILE'); process.stdout.write(JSON.stringify(d.privateKey))");

const now = Math.floor(Date.now() / 1000);
const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' })).toString('base64url');
const payload = Buffer.from(JSON.stringify({ iss: issuerId, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' })).toString('base64url');

const signingInput = header + '.' + payload;
const sign = crypto.createSign('SHA256');
sign.update(signingInput);
const derSig = sign.sign({ key: privateKey, dsaEncoding: 'der' });

// Convert DER signature to raw r||s for JWT
const r = derSig.slice(derSig[3] === 32 ? 4 : (derSig[3] === 33 ? 5 : 4), derSig[3] === 32 ? 36 : 37);
const sOffset = 2 + derSig[1] - 32;
const s = derSig.slice(sOffset);
const rawSig = Buffer.concat([r.slice(-32), s.slice(-32)]);

process.stdout.write(signingInput + '.' + rawSig.toString('base64url'));
JSEOF
}

JWT=$(generate_jwt)

echo "=== Generated JWT (truncated) ==="
echo "${JWT:0:100}..."
echo ""

ASC_BASE="https://api.appstoreconnect.apple.com/v1"

asc_get() {
  curl -sS -H "Authorization: Bearer $JWT" "$ASC_BASE$1"
}

asc_post() {
  curl -sS -X POST \
    -H "Authorization: Bearer $JWT" \
    -H "Content-Type: application/json" \
    -d "$2" \
    "$ASC_BASE$1"
}

pretty() { python3 -m json.tool 2>/dev/null || cat; }

echo "=== Bundle IDs ==="
asc_get "/bundleIds?limit=20" | node -e "
const chunks=[]; process.stdin.on('data',c=>chunks.push(c)); process.stdin.on('end',()=>{
  const d=JSON.parse(Buffer.concat(chunks));
  (d.data||[]).forEach(i=>console.log('  '+i.id+'  '+i.attributes.identifier+'  ('+i.attributes.name+')'));
})
"
echo ""

echo "=== Certificates ==="
asc_get "/certificates?limit=20" | node -e "
const chunks=[]; process.stdin.on('data',c=>chunks.push(c)); process.stdin.on('end',()=>{
  const d=JSON.parse(Buffer.concat(chunks));
  (d.data||[]).forEach(i=>console.log('  '+i.id+'  '+i.attributes.certificateType+'  '+i.attributes.name+'  exp:'+String(i.attributes.expirationDate||'?').slice(0,10)));
})
"
echo ""

echo "=== Devices ==="
asc_get "/devices?limit=20" | node -e "
const chunks=[]; process.stdin.on('data',c=>chunks.push(c)); process.stdin.on('end',()=>{
  const d=JSON.parse(Buffer.concat(chunks));
  (d.data||[]).forEach(i=>console.log('  '+i.id+'  '+i.attributes.name+'  '+i.attributes.deviceClass+'  '+i.attributes.status));
})
"
echo ""

# -----------------------------------------------------------------------
# CREATE PROFILE — set these env vars to proceed:
#   BUNDLE_ID_RESOURCE  — bundle ID resource ID (from listing above)
#   CERT_ID             — certificate resource ID (from listing above)
#   PROFILE_NAME        — desired profile name (default: TestProfile)
#   PROFILE_TYPE        — IOS_APP_DEVELOPMENT | IOS_APP_STORE | etc.
#   DEVICE_IDS          — comma-separated device IDs (for dev profiles)
# -----------------------------------------------------------------------
BUNDLE_ID_RESOURCE="${BUNDLE_ID_RESOURCE:-}"
CERT_ID="${CERT_ID:-}"
PROFILE_NAME="${PROFILE_NAME:-TestProfile}"
PROFILE_TYPE="${PROFILE_TYPE:-IOS_APP_DEVELOPMENT}"

if [[ -z "$BUNDLE_ID_RESOURCE" || -z "$CERT_ID" ]]; then
  echo "=== Skipping profile creation ==="
  echo "Run with env vars to create a profile, e.g.:"
  echo "  BUNDLE_ID_RESOURCE=<id> CERT_ID=<id> PROFILE_NAME=MyProfile PROFILE_TYPE=IOS_APP_STORE bash $0"
  exit 0
fi

BODY=$(node -e "
const body = {
  data: {
    type: 'profiles',
    attributes: { name: process.env.PROFILE_NAME, profileType: process.env.PROFILE_TYPE },
    relationships: {
      bundleId: { data: { type: 'bundleIds', id: process.env.BUNDLE_ID_RESOURCE } },
      certificates: { data: [{ type: 'certificates', id: process.env.CERT_ID }] }
    }
  }
};
if (process.env.DEVICE_IDS) {
  const ids = process.env.DEVICE_IDS.split(',').map(i => ({ type: 'devices', id: i.trim() }));
  body.data.relationships.devices = { data: ids };
}
console.log(JSON.stringify(body, null, 2));
" PROFILE_NAME="$PROFILE_NAME" PROFILE_TYPE="$PROFILE_TYPE" \
  BUNDLE_ID_RESOURCE="$BUNDLE_ID_RESOURCE" CERT_ID="$CERT_ID" \
  DEVICE_IDS="${DEVICE_IDS:-}")

echo "=== Creating Profile: $PROFILE_NAME ($PROFILE_TYPE) ==="
echo "Request body:"
echo "$BODY"
echo ""
echo "Response:"
asc_post "/profiles" "$BODY" | pretty
