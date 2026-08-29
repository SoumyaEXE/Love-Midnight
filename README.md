# Halo

**Meet nearby. Prove nothing.**

A proximity-based social app built on Midnight. Halo matches people who are physically near each other and share interests — without ever holding a coordinate, an interest vector, or a date of birth.

Every claim the app makes about a person is the output of a zero-knowledge circuit. There is no privileged server view: the operator cannot locate a user, cannot read what they like, and cannot deanonymise a match, because that data is never transmitted in a form anyone can open.

---

## The argument

A conventional dating app puts people on a map. That is a confession — it can only draw a pin because it is holding a coordinate, and once it holds one it can sell it, leak it, or be compelled to hand it over.

Halo cannot draw a pin. Its circuit yields a *bucket* — closest, nearby, walkable, area — and nothing else. So the home screen is a real map, but nobody on it has a position: each person is a soft **uncertainty area** whose radius is the bucket their proof disclosed, with their avatar at the centre of the region rather than at a point. Zooming never sharpens it, because there is nothing sharper underneath.

The same move is made three more times:

| Instead of | Halo proves |
|---|---|
| Storing your GPS position | You are within *R* of this person |
| Storing your date of birth | You are over 18 |
| Scoring your interests server-side | The agreed model produced this score, on dimensions you both opened |

---

## The four circuits

Written in Compact, in [`contracts/`](contracts/).

### `proximity.compact`
Both devices snap their GPS fix to a 250 m grid and publish only `Commit(cell, salt)`. The circuit takes both private cells plus both public commitments and proves three things at once: each cell opens its own commitment, the squared distance is within range, and the disclosed bucket is the correct bucket for that distance. Only the bucket is revealed.

Replay is prevented by a nullifier over `(commitA, commitB, epoch)` — a pair can register proximity once per 15-minute epoch, so an attacker cannot grind thousands of proofs at shifting positions to trilaterate someone.

### `match.compact` — *the AI track*
Halo's matcher is a fixed-weight scorer over a 16-dimension interest vector, running entirely on the handset. The circuit proves the score is the correct dot product of two committed vectors **under the model weights the network sanctioned** — so the model cannot be quietly swapped for one that favours a paying advertiser.

The clause that server-side recommenders cannot offer: every dimension either party flagged private is multiplied by zero *inside the circuit*. A user marking "health" or "politics" private gets a proof that the model was structurally unable to read those dimensions — not a promise that it chose not to.

Only a coarse 0–4 band is disclosed. The exact score would leak the vector under repeated queries against attacker-chosen profiles.

### `credential.compact`
Age and personhood gating with no identity document touching the app. The user holds an issuer-signed credential in their wallet; Halo sees a proof that *some* credential from an accepted issuer attests adulthood, plus a nullifier derived from the credential subject and a Halo-specific domain.

That nullifier is the interesting half: Halo gets exactly one persistent handle per real person — so bans and rate limits work across reinstalls — while the same credential yields a completely unlinkable handle in any other app.

### Cross-chain — *Midnight × Solana*
Midnight is the privacy engine; Solana is the public record. What crosses is a 64-byte nullifier and a one-byte band, published as a memo.

Why bother: a match that only exists inside a shielded ledger cannot be used anywhere else. Publishing the nullifier gives the pair a portable receipt any Solana program can read — a ticketing app can gate on "these two have a Halo match" without Halo's servers existing, and without learning who they are.

The nullifier is safe to publish precisely because it is a hash of two commitments: it identifies the *relationship*, not either person. Timestamps are rounded to the hour so timing does not become a fingerprint. See [`src/chain/bridge.ts`](src/chain/bridge.ts) for what is deliberately **not** bridged.

---

## Running it

```bash
npm install
npx expo start
```

Press `i` for iOS, `a` for Android. It runs in Expo Go — Skia and the blur views are both bundled there — so no development build is needed to demo it.

Two warnings on start are expected and harmless: `rpc-websockets` and `@noble/hashes` are `@solana/web3.js` dependencies whose `exports` maps do not cover React Native's platform resolution, so Metro falls back to file-based resolution and they work.

### Pointing at real infrastructure

Everything is configured through `extra` in `app.json`, so one binary can be repointed without a rebuild:

```json
"extra": {
  "midnightProofServer": "http://192.168.1.20:6300",
  "solanaCluster": "https://api.devnet.solana.com"
}
```

The proof server default is `127.0.0.1`, which resolves to nothing on a phone. That is deliberate: it is the one component that sees private inputs, and the failure mode of a stale hosted URL left in a build is that witnesses leave the handset. Loopback fails safe.

---

## What is live, and what is not

Being precise about this, because a demo that silently fakes its centrepiece is worse than one that says which half is real.

| Component | Status |
|---|---|
| Compact circuits | **Written**, not compiled here — needs `compactc` |
| Commitment scheme, nullifiers, grid quantisation | **Live.** Real SHA-256, byte-identical to the circuits |
| Matching model, scoring, explanations | **Live.** Runs on device, production code path |
| Proof generation | **Live against a proof server**, simulated otherwise |
| Solana attestation encoding | **Live.** Real memo bytes, shown in the proof sheet |
| Midnight wallet connection | **Deeplink transport written**; no mobile wallet ships the scheme yet |

The simulated prover is not a stub. It re-runs every assertion the Compact circuit makes — openings, range checks, thresholds — and refuses on the same conditions, so the demo cannot show a proof for a claim that is false. What it does not produce is a cryptographically verifiable object, and `Proof.simulated` propagates all the way into the UI, which renders a different badge and an explicit notice.

Same honesty in the wallet layer: with no Midnight mobile wallet installed, Halo derives a key in the platform keystore and labels it "On-device key". The address is prefixed `mn_demo1` rather than `mn_shield-addr` so nobody can paste it somewhere and have it look funded.

---

## Design system

Vercel's **Geist** across the whole ramp, weighted thin — display copy sits at 100–200, and only badges and buttons reach 500. No monospace anywhere: proof digests and wallet addresses use Geist Regular with open tracking and `tabular-nums`, which reads as machine output without pulling a second family into the bundle.

**Liquid glass** ([`src/components/glass/LiquidGlass.tsx`](src/components/glass/LiquidGlass.tsx)) is a React Native port of the technique in [`rdev/liquid-glass-react`](https://github.com/rdev/liquid-glass-react). The web original refracts its backdrop with an SVG `feDisplacementMap`; RN has no equivalent, because a native blur view cannot hand its sampled backdrop to Skia and Skia cannot sample outside its own canvas. So the refraction is reconstructed from four layers — genuine `expo-blur` backdrop, a top-lit wash, a **Skia sweep-gradient specular rim**, and a 1px glass lip. The rim does the real work: a lens edge is bright where light enters and carries a dimmer bounce opposite, which a sweep gradient reproduces and a plain border cannot.

**Metal buttons** ([`src/components/ui/MetalButton.tsx`](src/components/ui/MetalButton.tsx)) stack six layers — contact shadow, gradient bevel ring, three-stop face with its midpoint at 0.55, top-third specular, bottom occlusion, and a sheen band swept on press. Pressing scales down, darkens the face, tightens the shadow toward the surface, and slides the sheen; four coupled changes are what make it feel pressed rather than animated.

**Icons** ([`src/components/icons/Icon.tsx`](src/components/icons/Icon.tsx)) are drawn to Nucleo UI's construction rules — 24px grid, 1.5 stroke, round caps, half-pixel alignment — because Nucleo is commercially licensed and its SVGs cannot be vendored. Swap a `case` body for licensed path data and the wrapper keeps supplying stroke, colour, and sizing.

**The map** ([`src/components/map/`](src/components/map/)) is a Skia vector map, generated rather than fetched. That is a privacy decision before it is a technical one: requesting tiles means sending coordinates to a third party on every pan, which is the exact disclosure this app exists to avoid. Leaflet would need a WebView plus network tiles in someone else's palette; `react-native-maps` needs an API key and is unreliable in Expo Go. So `cityPlan.ts` generates a deterministic pseudo-city — water, parkland, blocks, streets, arterials, tilted off-axis — and `PrivacyMap.tsx` draws it with the uncertainty areas over the top. It depicts nowhere, because the app knows nowhere.

**Avatars** resolve through Gravatar's SHA-256 endpoint via `expo-crypto`. None of the demo addresses are registered, so each falls back to `wavatar` — the only Gravatar style that generates varied faces rather than robots or geometry. `fallback` also accepts an absolute https URL, so pointing it at a hosted portrait set is one line in [`src/data/gravatar.ts`](src/data/gravatar.ts).

---

## Layout

```
app/                    routes (expo-router)
  (tabs)/               radar · winkers · chat · profile
  person/[id]           profile + on-device compatibility
  proof/[id]            disclosed vs. withheld, plus the Solana memo
  privacy               broadcast controls, cross-chain, data reset
contracts/              Compact circuits
src/
  ai/matching.ts        the 16-dimension scorer and its explanations
  chain/
    midnight/           connector, commitments, prover
    bridge.ts           Midnight × Solana attestations
  components/           glass, metal, icons, radar
  state/store.tsx       the only place private material lives
  theme/                tokens and the Geist scale
```

`src/state/store.tsx` is deliberately small and hand-rolled. The interesting invariant is that the private material — interest vector, grid cell, salts — lives there and only there, and the only thing that ever leaves is a commitment or a proof. Keeping that in one file makes the claim auditable in a way that scattering it across hooks would not.

Session salts are generated at launch and never persisted, so yesterday's published commitments cannot be linked to today's even by an observer logging every commitment the app has made.
