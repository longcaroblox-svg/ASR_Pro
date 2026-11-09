/** Fast IO helpers. */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function readBytes(filePath) {
  return fs.readFileSync(filePath);
}

export function atomicWriteText(filePath, text) {
  fs.mkdirSync(path.dirname(String(filePath)), { recursive: true });
  // Unique per-write temp: concurrent writers / PID reuse can never collide.
  // Exclusive "wx" creation + unique name gives wx semantics (no clobber).
  const uniq = `${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString("hex")}`;
  const temp = `${filePath}.partial.${uniq}`;
  let fd;
  try {
    fd = fs.openSync(temp, "wx");
  } catch (exc) {
    try {
      fs.rmSync(temp, { force: true });
    } catch {
      /* ignore */
    }
    throw exc;
  }
  try {
    fs.writeFileSync(fd, text, "utf8");
    try {
      fs.fsyncSync(fd);
    } catch {
      /* durability best-effort (exotic FS) */
    }
  } catch (exc) {
    try {
      fs.closeSync(fd);
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(temp, { force: true });
    } catch {
      /* ignore */
    }
    throw exc;
  }
  fs.closeSync(fd);
  // Windows: rename can hit EPERM/EACCES under AV/file-indexer locks — retry.
  let lastExc = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      fs.renameSync(temp, filePath);
      lastExc = null;
      break;
    } catch (exc) {
      lastExc = exc;
      if (attempt < 4 && (exc?.code === "EPERM" || exc?.code === "EACCES" || exc?.code === "EBUSY")) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10 * (attempt + 1));
        continue;
      }
      break;
    }
  }
  if (lastExc) {
    try {
      fs.rmSync(temp, { force: true });
    } catch {
      /* ignore */
    }
    throw lastExc;
  }
  // Dir-fsync so the rename itself survives a crash (POSIX durability).
  try {
    const dirFd = fs.openSync(path.dirname(String(filePath)), "r");
    try {
      fs.fsyncSync(dirFd);
    } finally {
      fs.closeSync(dirFd);
    }
  } catch {
    /* best-effort (Windows/exotic FS may not support dir fsync) */
  }
}
