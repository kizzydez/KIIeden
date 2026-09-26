"use client";

/// Consent record for optional browser storage. Stored locally in this browser only;
/// it is never sent anywhere.
///   necessary  - always on: this consent record itself, and the wallet connection
///                that your wallet library keeps so you stay connected.
///   functional - optional: remembering your Pinata upload key on this device
///                (otherwise it lives only until you close the tab).
/// There are no analytics, advertising or tracking cookies or scripts in this app.

const KEY = "kiieden_consent_v1";
const EVENT = "kiieden-consent-change";

export type Consent = { functional: boolean; decidedAt: string };

export function readConsent(): Consent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Consent;
    return typeof v.functional === "boolean" ? v : null;
  } catch {
    return null;
  }
}

export function saveConsent(functional: boolean) {
  const value: Consent = { functional, decidedAt: new Date().toISOString() };
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
    if (!functional) localStorage.removeItem("kiieden_pinata_jwt"); // withdrawing consent removes what it allowed
  } catch {
    /* storage blocked: the choice simply won't persist */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function hasFunctionalConsent(): boolean {
  return readConsent()?.functional === true;
}

export function reopenConsent() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function onConsentChange(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}
