// Import GUN for side effects (it registers global Gun/GUN).
import "https://cdn.jsdelivr.net/npm/gun/gun.js";

function getGunCtor() {
  // Depending on build, we might get Gun or GUN.
  return globalThis.Gun || globalThis.GUN;
}

const DEFAULT_PEERS = [
  // Public test peers seen in examples/issues. Expect occasional flakiness.
  "https://try.axe.eco/gun",
  "https://test.era.eco/gun",
  "https://gun-manhattan.herokuapp.com/gun", // historically common, but can be down.
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
      if (seen.has(data.id)) return;
      seen.add(data.id);
      onPost(data);
    });
}
