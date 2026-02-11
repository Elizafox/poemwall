import { generatePoem, checkPoem } from "./generator.js";
import {
  loadPeers,
  savePeers,
  makeGun,
  postPoem,
  subscribeFeed,
} from "./gunStore.js";
import { findPow, currentEpoch, verifyPow } from "./pow.js";

const MAX_EPOCH_DRIFT = 3; // e.g. 3 * 24h
const MIN_DIFFICULTY = 20; // Minimum difficulty
const CUR_DIFFICULTY = 20; // Current difficulty
const COOLDOWN_MS = 15_000; // 15s
const COOLDOWN_KEY = "poemwall:cooldownUntil";

function nowMs() {
  return Date.now();
}

function getCooldownUntil() {
  const v = Number(localStorage.getItem(COOLDOWN_KEY));
  return Number.isFinite(v) ? v : 0;
}

function setCooldownUntil(t) {
  localStorage.setItem(COOLDOWN_KEY, String(t));
}

function remainingMs() {
  return Math.max(0, getCooldownUntil() - nowMs());
}

function formatSeconds(ms) {
  return String(Math.ceil(ms / 1000));
}

function updateCooldownUI() {
  const ms = remainingMs();
  const onCooldown = ms > 0;

  // Disable submit during cooldown
  submitBtn.disabled = onCooldown;
  textarea.disabled = onCooldown;

  if (onCooldown) {
    status.textContent = `Cooldown: ${formatSeconds(ms)}s`;
  } else if (status.textContent.startsWith("Cooldown:")) {
    status.textContent = "";
  }
}

function startCooldown() {
  setCooldownUntil(nowMs() + COOLDOWN_MS);
  updateCooldownUI();

  if (cooldownTimer) clearInterval(cooldownTimer);
  cooldownTimer = setInterval(() => {
    updateCooldownUI();
    if (remainingMs() === 0) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
      updateCooldownUI();
    }
  }, 250);
}

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
const submitBtn = document.getElementById("submit-btn");

const peersBox = document.getElementById("peers");
const savePeersBtn = document.getElementById("save-peers");
const peerStatus = document.getElementById("peer-status");

const feed = document.getElementById("feed");

let cooldownTimer = null;

updateCooldownUI();
if (remainingMs() > 0) startCooldown();

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

function renderPost({ ts, poem }) {
  const el = document.createElement("div");
  el.className = "post";

  const meta = document.createElement("div");
  meta.className = "meta";

  const when = new Date(ts || Date.now()).toLocaleString();

  meta.textContent = `${when}`;

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

    const poem = post.poem;
    const epoch = post.pow_epoch;
    const difficulty = post.pow_difficulty;
    const nonce = post.pow_nonce;

    if (difficulty < MIN_DIFFICULTY) return;
    if (!isEpochFresh(epoch)) return;

    let verify_poem = await checkPoem(poem);
    if (!verify_poem) return;

    let verify_pow = await verifyPow({ poem, epoch, difficulty, nonce });
    if (!verify_pow) return;

    renderPost(post);
  } catch (err) {
    // If verification fails unexpectedly, drop it.
    console.warn("PoW verify error", err);
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Block if cooling down
  if (remainingMs() > 0) {
    status.textContent = `Cooldown: ${formatSeconds(remainingMs())}s`;
    return;
  }

  const msg = textarea.value.trim();
  if (!msg) return;

  // Start cooldown immediately (prevents double-submit spam even if mining is slow)
  startCooldown();

  preview.textContent = "⏳ Generating…";
  copyBtn.disabled = true;
  status.textContent = "";

  try {
    const poem = await generatePoem(msg);
    preview.textContent = poem;

    const epoch = currentEpoch();
    const pow = await findPow({
      poem,
      epoch,
      difficulty: CUR_DIFFICULTY,
      onProgress: ({ tried, best }) => {
        status.textContent = `Completing anti-spam puzzle… tried ${tried.toLocaleString()} (best ${best} bits)`;
      },
    });

    const res = postPoem(gun, {
      poem,
      pow_epoch: pow.epoch,
      pow_difficulty: pow.difficulty,
      pow_nonce: pow.nonce,
    });
    if (!res) throw new Error(`Could not post poem: ${res}`);

    copyBtn.disabled = false;
    status.textContent = "Posted.";

    // Clear the form after success
    textarea.value = "";
    count.textContent = "0";
  } catch (err) {
    console.error(err);
    preview.textContent = "⚠️ Something went wrong.";

    // If posting fails, refund cooldown
    setCooldownUntil(0);
    updateCooldownUI();
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
