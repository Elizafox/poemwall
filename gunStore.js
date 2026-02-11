// Import GUN for side effects (it registers global Gun/GUN).
import "https://cdn.jsdelivr.net/npm/gun/gun.js";

function getGunCtor() {
  // Depending on build, we might get Gun or GUN.
  return globalThis.Gun || globalThis.GUN;
}

const DEFAULT_PEERS = [
  "https://gun.defucc.me/gun",
  "https://gun.o8.is/gun",
  "https://shogun-relay.scobrudot.dev/gun",
  "https://relay.peer.ooo/gun",
  "https://try.axe.eco/gun",
  "https://test.era.eco/gun",
];

export function loadPeers() {
  const raw = localStorage.getItem("poemwall:peers");
  if (!raw) return DEFAULT_PEERS.slice();
  const peers = raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return peers.length ? peers : DEFAULT_PEERS.slice();
}

export function savePeers(peers) {
  localStorage.setItem("poemwall:peers", peers.join("\n"));
}

export function makeGun(peers) {
  const GunCtor = getGunCtor();
  if (!GunCtor) throw new Error("GUN did not load. Check CDN import.");
  return GunCtor(peers);
}

export function postPoem(gun, { poem, pow_epoch, pow_difficulty, pow_nonce }) {
  const id = crypto.randomUUID();
  const ts = Date.now();

  gun.get("poemwall").get("posts").get("v1").set({
    id,
    ts,
    poem,
    pow_epoch,
    pow_difficulty,
    pow_nonce,
  });
  return { id, ts };
}

export function subscribeFeed(gun, onPost) {
  const seen = new Set();

  gun
    .get("poemwall")
    .get("posts")
    .get("v1")
    .map()
    .on((data) => {
      if (!data || typeof data !== "object") return;
      if (!data.id || !data.poem) return;
      if (!data.pow_epoch || !data.pow_nonce || !data.pow_difficulty) return;
      if (seen.has(data.id)) return;
      seen.add(data.id);
      onPost(data);
    });
}
