# Sovereign Launch Checklist

Launch posture: **PREPARING FOR IGNITION**

This board is the final go/no-go control surface for `v1.0`.

---

## Gate 1 — The “iPhone” UX Gate

**Objective:** The product feels premium, native, and jargon-free.

- [ ] Discovery feels effortless on mobile and desktop.
- [ ] Card-to-detail transitions are smooth and continuous.
- [ ] Swipe-down mini-player feels rubbery and natural.
- [ ] Backup ring animation feels calm and high-end.
- [ ] Corner protocol trigger stays subtle and elegant.
- [ ] Final jargon scan passes (no technical terms in user labels, toasts, or buttons).

**Fail condition:** Any user-facing technical copy appears during normal flow.

---

## Gate 2 — The “Netflix” Performance Gate

**Objective:** Large media starts fast and stays stable.

- [ ] Time-to-first-play for common assets stays within target on Wi-Fi.
- [ ] Playback remains stable during long sessions.
- [ ] Progressive playback path starts before full file completion.
- [ ] 4K creator uploads complete without memory spikes.
- [ ] Mobile playback remains smooth after minimize/restore cycles.

**Fail condition:** Stalls, crashes, or visible UI hitching under normal network conditions.

---

## Gate 3 — The “Wall Street” Financial Gate

**Objective:** The direct split is correct and verifiable every time.

- [ ] On-chain purchase executes creator/platform split atomically (99/1).
- [ ] Biometric one-tap purchase flow shows clear status progression.
- [ ] Verified receipts appear with explorer links and DIRECT signal.
- [ ] Creator earnings rollups reconcile with transaction history.
- [ ] Replay simulation validates split correctness at scale.

**Fail condition:** Any mismatch in creator/platform split or purchase verification.

---

## Gate 4 — The “Sovereign” Freedom Gate

**Objective:** Backup always returns permanent user possession.

- [ ] Backup decrypts full stream into a usable master file.
- [ ] Completion message confirms possession clearly.
- [ ] Backup continues cleanly through temporary network drops.
- [ ] Restored connection resumes backup with user-safe messaging.
- [ ] Backed-up files open correctly across major devices.

**Fail condition:** Incomplete, corrupted, or unusable backup file.

---

## Gate 5 — The “Hacker” Reliability Gate

**Objective:** Infra holds under real-world instability.

- [ ] Function secrets and runtime configs are validated and rotated.
- [ ] IPFS upload and gateway retrieval remain stable.
- [ ] Retry paths are tested for intermittent mobile signal loss.
- [ ] Error language remains calm, human, and actionable.
- [ ] Monitoring and alerts are live for purchase, backup, and listing failures.

**Fail condition:** Silent failures or unrecoverable states during network volatility.

---

## 48-Hour Hardening Sprint

1. Jargon vacuum for all user-facing text.
2. UX polish pass on transitions, gestures, and backup feel.
3. Financial replay verification (high-volume simulated purchases).
4. Explorer receipt consistency audit.

---

## 72-Hour Reliability Sprint

1. Texas chaos test: intermittent connectivity during backup and playback.
2. IPFS retrieval disruption tests and graceful recovery checks.
3. Functions resilience checks for retries and degraded states.
4. Final incident runbook review and alert validation.

---

## Replay Proof Requirement

Before launch, run a scripted purchase replay suite that simulates high-volume buys and verifies:

- creator share correctness,
- platform share correctness,
- receipt consistency,
- entitlement consistency.

All checks must pass with zero unresolved deltas.

---

## Go / No-Go Rule

Launch only when every gate is green and replay proof is attached.

**No partial launch. No middleman fallback. Full Sovereign standard.**
