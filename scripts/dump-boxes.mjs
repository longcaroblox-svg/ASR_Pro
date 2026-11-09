/** Dump MP4 box tree — diagnostic tool. Usage: node scripts/dump-boxes.mjs <file> */
import fs from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/dump-boxes.mjs <file>");
  process.exit(2);
}
const fd = fs.openSync(file, "r");
const fileSize = fs.fstatSync(fd).size;

function walk(start, end, depth) {
  let pos = BigInt(start);
  const limit = BigInt(end);
  while (pos + 8n <= limit) {
    const hb = Buffer.alloc(8);
    fs.readSync(fd, hb, 0, 8, Number(pos));
    let size = hb.readUInt32BE(0);
    let hlen = 8;
    if (size === 1) {
      const lb = Buffer.alloc(8);
      fs.readSync(fd, lb, 0, 8, Number(pos) + 8);
      size = Number(lb.readBigUInt64BE(0));
      hlen = 16;
    } else if (size === 0) {
      size = Number(limit - pos);
    }
    if (size < hlen || pos + BigInt(size) > limit) {
      console.log("  ".repeat(depth) + `<bad size=${size} @${pos}>`);
      break;
    }
    const type = hb.subarray(4, 8).toString("latin1");
    console.log("  ".repeat(depth) + `${type} @${pos} size=${size}`);
    if (["moov", "trak", "mdia", "minf", "stbl", "moof", "edts", "mvex"].includes(type) && depth < 4) {
      walk(Number(pos) + hlen, Number(pos) + size, depth + 1);
    }
    pos += BigInt(size);
  }
}

walk(0, fileSize, 0);
fs.closeSync(fd);
