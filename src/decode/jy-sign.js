/** Jianying local MD5 sign + TDID — protocol-locked. */

import crypto from "node:crypto";
import os from "node:os";
import { PERF } from "../core/config.js";

function firstMacDecimal() {
  const interfaces = os.networkInterfaces();
  for (const list of Object.values(interfaces)) {
    for (const ni of list ?? []) {
      if (ni.mac && ni.mac !== "00:00:00:00:00:00" && !ni.internal) {
        return Number.parseInt(ni.mac.replace(/:/g, ""), 16);
      }
    }
  }
  // uuid.getnode() fallback: random 48-bit with multicast bit set.
  const rand = crypto.randomBytes(6);
  rand[0] |= 0x01;
  return Number.parseInt(rand.toString("hex"), 16);
}

let cachedTdid = null;

// TDID length is VARIABLE by design: the "390+digit" prefix is 3 chars, but the
// MAC-derived decimal suffix has no fixed width — padStart(13, "0") is a minimum,
// not a truncation. A 48-bit MAC (max 281474976710655, 15 digits) yields 16–18
// chars total; odd-year digits use the fixed 13-digit suffix (always 16 chars).
// The server accepts this variable length (protocol-locked: do not truncate).
export function tdid() {
  if (cachedTdid) return cachedTdid;
  const digit = new Date().getFullYear() % 10;
  let suffix;
  if (digit % 2) {
    suffix = "3278516897751";
  } else {
    suffix = String(firstMacDecimal()).padStart(13, "0");
  }
  cachedTdid = `${390 + digit}${suffix}`;
  return cachedTdid;
}

export function jyHeaders(endpoint, deviceId, appVersion = null) {
  if (!deviceId || !String(deviceId).trim()) {
    throw new TypeError("jyHeaders: deviceId must be non-empty");
  }
  const version = String(appVersion ?? PERF.JY_APPVR).trim();
  if (!version) {
    throw new TypeError("jyHeaders: appVersion must be non-empty");
  }
  // Golden vector (unit-test reference — tests/test-decode-units.mjs):
  // endpoint="/lv/v1/upload_sign", version="10.9.0", device-time="1700000000",
  // deviceId="3901234567890123" → suffix "ad_sign" →
  // md5("9e2c|ad_sign|4|10.9.0|1700000000|3901234567890123|11ac")
  //   = "4ba640288bb5584de3f38525b475949e".
  const now = String(Math.floor(Date.now() / 1000));
  const suffix = endpoint.length >= 7 ? endpoint.slice(-7) : endpoint;
  const signature = crypto
    .createHash("md5")
    .update(`9e2c|${suffix}|4|${version}|${now}|${deviceId}|11ac`, "utf8")
    .digest("hex");
  return {
    "User-Agent": PERF.JY_SIGN_UA,
    appvr: version,
    "device-time": now,
    pf: "4",
    sign: signature,
    "sign-ver": "1",
    tdid: deviceId,
    "Content-Type": "application/json",
  };
}
