/** AWS4 VOD signer for Jianying upload auth. */

import crypto from "node:crypto";

const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

function hmac(key, message) {
  return crypto.createHmac("sha256", key).update(message, "utf8").digest();
}

export function aws4VodSignature(secret, query, headers) {
  const amzEntry = Object.entries(headers).find(([k]) => String(k).toLowerCase() === "x-amz-date");
  const amzDate = amzEntry?.[1];
  if (!amzDate || !String(amzDate).trim()) throw new TypeError("aws4: missing x-amz-date");
  const date = String(amzDate).split("T")[0];
  // AWS4 canonical form: lowercase names, trimmed values, sorted by name.
  const entries = Object.entries(headers)
    .map(([k, v]) => [String(k).toLowerCase(), String(v).trim()])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const canonicalHeaders = entries.map(([k, v]) => `${k}:${v}`).join("\n") + "\n";
  const signedHeaders = entries.map(([k]) => k).join(";");
  const request = `GET\n/\n${query}\n${canonicalHeaders}\n${signedHeaders}\n${EMPTY_SHA256}`;
  const scope = `${date}/cn/vod/aws4_request`;
  const toSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    crypto.createHash("sha256").update(request, "utf8").digest("hex"),
  ].join("\n");
  let key = hmac(Buffer.from(`AWS4${secret}`, "utf8"), date);
  for (const part of ["cn", "vod", "aws4_request"]) {
    key = hmac(key, part);
  }
  return crypto.createHmac("sha256", key).update(toSign, "utf8").digest("hex");
}

export function buildApplyUploadQuery(fileSize) {
  const size = Number(fileSize);
  if (!Number.isFinite(size) || size < 0) throw new TypeError("aws4: FileSize must be >= 0, got " + JSON.stringify(fileSize));
  const enc = encodeURIComponent;
  return [
    "Action=" + enc("ApplyUploadInner"),
    "FileSize=" + enc(String(Math.trunc(size))),
    "FileType=" + enc("object"),
    "IsInner=" + enc("1"),
    "SpaceName=" + enc("lv-mac-recognition"),
    "Version=" + enc("2020-11-19"),
    "s=" + enc("5y0udbjapi"),
  ].join("&");
}

export function buildApplyUploadAuthHeaders(access, secret, token, query) {
  if (!String(access ?? "").trim()) throw new TypeError("aws4: access key empty");
  if (!String(secret ?? "").trim()) throw new TypeError("aws4: secret key empty");
  if (!String(token ?? "").trim()) throw new TypeError("aws4: session token empty");
  const now = new Date();
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  const amz =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const date = amz.slice(0, 8);
  const authHeaders = { "x-amz-date": amz, "x-amz-security-token": String(token) };
  const signature = aws4VodSignature(String(secret), query, authHeaders);
  authHeaders.authorization =
    `AWS4-HMAC-SHA256 Credential=${access}/${date}/cn/vod/aws4_request, ` +
    `SignedHeaders=x-amz-date;x-amz-security-token, Signature=${signature}`;
  return authHeaders;
}
