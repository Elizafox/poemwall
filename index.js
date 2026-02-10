import { generatePoem } from "./generator.js";
import {
  loadPeers,
  savePeers,
  makeGun,
  postPoem,
  subscribeFeed,
} from "./gunStore.js";
import { findPow, currentEpoch, verifyPow } from "./pow.js";

const MAX_EPOCH_DRIFT = 3; // e.g. 3 * 10min = 30 minutes if epoch is 10min
const MIN_DIFFICULTY = 20; // Minimum difficulty
const CUR_DIFFICULTY = 20; // Current difficulty

function isEpochFresh(epoch) {
  const now = currentEpoch();
  const diff = Math.abs(now - epoch);
  return diff <= MAX_EPOCH_DRIFT;
}

const textarea = document.getElementById("phrase");
const count = document.getElementById("char-count");
const preview = document.getElementById("preview");
const form = document.getElementById("phrase-form");
const status = document.getElementById("status");
const copyBtn = document.getElementById("copy-btn");

const peersBox = document.getElementById("peers");
const savePeersBtn = document.getElementById("save-peers");
const peerStatus = document.getElementById("peer-status");

const feed = document.getElementById("feed");

textarea.addEventListener("input", () => {
  count.textContent = String(textarea.value.length);
});
count.textContent = String(textarea.value.length);

// Peer setup
peersBox.value = loadPeers().join("\n");

let gun = makeGun(loadPeers());

savePeersBtn.addEventListener("click", () => {
  const peers = peersBox.value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  savePeers(peers);
  gun = makeGun(loadPeers());
  peerStatus.textContent = "Saved. Reconnected.";
});

function renderPost({ ts, poem, pow_epoch, pow_difficulty }) {
  const el = document.createElement("div");
  el.className = "post";

  const meta = document.createElement("div");
  meta.className = "meta";

  const when = new Date(ts || Date.now()).toLocaleString();

  meta.textContent = `${when} · PoW ${pow_difficulty} bits · epoch ${pow_epoch}`;

  const p = document.createElement("p");
  p.className = "poem";
  p.textContent = poem;

  el.appendChild(meta);
  el.appendChild(p);

  feed.prepend(el);
}

subscribeFeed(gun, async (post) => {
  try {
    if (!post || typeof post !== "object") return;
    if (typeof post.poem !== "string") return;

    if (
      !Number.isInteger(post.pow_epoch) ||
      !Number.isInteger(post.pow_difficulty) ||
      typeof post.pow_nonce !== "string"
    )
      return;

    if (post.pow_difficutly < MIN_DIFFICULTY) return;
    if (!isEpochFresh(post.pow_epoch)) return;

    renderPost(post);
  } catch (err) {
    // If verification fails unexpectedly, drop it.
    console.warn("PoW verify error", err);
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  status.textContent = "";

  const msg = textarea.value.trim();
  if (!msg) return;

  preview.textContent = "Generating…";
  copyBtn.disabled = true;

  try {
    const poem = await generatePoem(msg);
    preview.textContent = poem;

    const epoch = currentEpoch(); // 10-min epoch by default
    const pow = await findPow({
      poem,
      epoch,
      difficulty: CUR_DIFFICULTY,
      onProgress: ({ tried, best }) => {
        status.textContent = `Mining… tried ${tried.toLocaleString()} (best ${best} bits)`;
      },
    });

    const res = postPoem(gun, {
      poem,
      pow_epoch: pow.epoch,
      pow_difficulty: pow.difficulty,
      pow_nonce: pow.nonce,
    });
    if (!res) return;

    copyBtn.disabled = false;
    status.textContent = "Posted to the wall.";
  } catch (err) {
    console.error(err);
    preview.textContent = "⚠️ Generator failed.";
    status.textContent = "Couldn’t post.";
  }
});

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(preview.textContent);
    status.textContent = "Copied.";
  } catch {
    status.textContent = "Couldn’t copy (browser said no).";
  }
});
