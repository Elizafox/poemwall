// pow.js: Proof-of-Work scheme for reducing spam

function concatBytes(...arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

function u32be(n) {
  const b = new Uint8Array(4);
  b[0] = (n >>> 24) & 0xff;
  b[1] = (n >>> 16) & 0xff;
  b[2] = (n >>> 8) & 0xff;
  b[3] = n & 0xff;
  return b;
}

function u64beBigInt(x) {
  // x: BigInt
  const b = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) {
    b[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return b;
}

async function sha256(bytes) {
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return new Uint8Array(buf);
}

// Count leading zero bits in a Uint8Array
function leadingZeroBits(hash) {
  let bits = 0;
  for (const byte of hash) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    // count leading zeros in this byte
    for (let i = 7; i >= 0; i--) {
      if ((byte & (1 << i)) === 0) bits++;
      else return bits;
    }
  }
  return bits;
}

const EPOCH_DEFAULT = 24 * 60 * 60 * 1000; // 24 hours
export function currentEpoch(epochMs = EPOCH_DEFAULT) {
  // Returns a u32 epoch number (fits for a long time)
  return Math.floor(Date.now() / epochMs) >>> 0;
}

/**
 * Find a nonce for Hashcash-style PoW.
 *
 * - poem: string (generated sentence)
 * - difficulty: leading zero bits required
 * - epoch: u32 (challenge)
 * - onProgress: optional callback({ tried, best }) occasionally
 */
export async function findPow({ poem, difficulty = 20, epoch, onProgress }) {
  if (typeof poem !== "string" || !poem.length)
    throw new Error("poem required");
  if (!Number.isInteger(difficulty) || difficulty < 0 || difficulty > 32) {
    throw new Error("difficulty should be 0..32-ish for SHA-256 PoW");
  }
  if (!Number.isInteger(epoch)) throw new Error("epoch must be a u32 number");

  const enc = new TextEncoder();
  const poemBytes = enc.encode(poem);

  // Hash the poem once so the inner loop is fixed-size
  const poemHash = await sha256(poemBytes);

  const epochBytes = u32be(epoch);

  let best = 0;
  let tried = 0;

  // 64-bit nonce space, starting random-ish
  let nonce =
    (BigInt(crypto.getRandomValues(new Uint32Array(2))[0]) << 32n) |
    BigInt(crypto.getRandomValues(new Uint32Array(2))[0]);

  const YIELD_EVERY = 500; // yield to UI every N attempts

  while (true) {
    const nonceBytes = u64beBigInt(nonce);

    const input = concatBytes(epochBytes, poemHash, nonceBytes);
    const h = await sha256(input);

    tried++;
    const z = leadingZeroBits(h);
    if (z > best) best = z;

    if (z >= difficulty) {
      return {
        epoch,
        difficulty,
        nonce: nonce.toString(), // store as string (JSON-safe)
        poemHash: Array.from(poemHash)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(""),
      };
    }

    nonce++;

    if (tried % YIELD_EVERY === 0) {
      onProgress?.({ tried, best });
      // Let the browser breathe
      await new Promise((r) => setTimeout(r, 0));
    }
  }
}

export async function verifyPow({ poem, epoch, difficulty, nonce }) {
  const enc = new TextEncoder();
  const poemHash = await sha256(enc.encode(poem));
  const input = concatBytes(u32be(epoch), poemHash, u64beBigInt(BigInt(nonce)));
  const h = await sha256(input);
  return leadingZeroBits(h) >= difficulty;
}
