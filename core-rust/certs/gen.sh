#!/usr/bin/env bash
# Generates a DEV-ONLY C2PA test chain (root CA + ES256 leaf). Not trusted by any validator.
set -euo pipefail
cd "$(dirname "$0")"
openssl ecparam -name prime256v1 -genkey -noout -out root.key
openssl req -new -x509 -key root.key -sha256 -days 3650 -out root.pem \
  -subj "/C=DE/O=CP2A Content Signer DEV/CN=CP2A Dev Root CA" \
  -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign"
openssl ecparam -name prime256v1 -genkey -noout | openssl pkcs8 -topk8 -nocrypt -out sample.key
openssl req -new -key sample.key -out leaf.csr -subj "/C=DE/O=CP2A Content Signer DEV/CN=CP2A Dev Signer"
printf "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=emailProtection\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid\n" > leaf.ext
openssl x509 -req -in leaf.csr -CA root.pem -CAkey root.key -CAcreateserial -out leaf.pem -days 3650 -sha256 -extfile leaf.ext
cat leaf.pem root.pem > sample.certs
rm -f leaf.csr leaf.ext leaf.pem root.key root.srl
