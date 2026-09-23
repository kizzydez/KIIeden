"use client";

import { reopenConsent } from "@/lib/consent";

export default function CookieSettingsButton() {
  return (
    <button type="button" data-cookie-settings="" className="btn btn-secondary" onClick={reopenConsent}>
      Change my cookie settings
    </button>
  );
}
