"use client";

import { useEffect, useState } from "react";
import { getPinataJwt, looksLikeJwt, setPinataJwt, testPinataJwt } from "@/lib/pinata";

export default function PinataKeyField() {
  const [jwt, setJwt] = useState("");
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const existing = getPinataJwt();
    setJwt(existing);
    setSaved(existing.length > 0);
    setOpen(existing.length === 0);
  }, []);

  const trimmed = jwt.trim();
  const valid = trimmed.length === 0 || looksLikeJwt(trimmed);

  async function save() {
    setPinataJwt(jwt);
    setSaved(trimmed.length > 0);
    if (trimmed.length === 0) return;
    // verify right away so a bad key is caught here, not halfway through a launch
    setTesting(true);
    const result = await testPinataJwt(trimmed);
    setTesting(false);
    setStatus(result);
    if (result.ok) setOpen(false);
  }

  return (
    <div className="glass p-4 mb-6">
      <button type="button" className="w-full flex items-center justify-between text-left" onClick={() => setOpen((v) => !v)}>
        <span className="text-sm font-semibold text-white flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${saved ? "bg-emerald-400 shadow-[0_0_10px_#34d399]" : "bg-amber-400"}`} />
          IPFS uploads (Pinata) {saved ? "· key saved" : "· key needed"}
        </span>
        <span className="text-zinc-400 text-xs">{open ? "Hide" : "Edit"}</span>
      </button>

      {open && (
        <div className="mt-3 page-enter">
          <label htmlFor="components-pinatakeyfield-1" className="label">Pinata API JWT</label>
          <div className="flex gap-2">
            <input id="components-pinatakeyfield-1"
              type="password"
              className="input"
              placeholder="eyJhbGciOiJIUzI1NiIs…"
              value={jwt}
              onChange={(e) => setJwt(e.target.value)}
              autoComplete="off"
            />
            <button type="button" onClick={save} disabled={!valid || trimmed.length === 0 || testing} className="btn btn-secondary shrink-0">
              {testing ? "Testing…" : "Save & test"}
            </button>
          </div>
          {status && <p className={`text-xs mt-2 ${status.ok ? "text-emerald-400" : "text-rose-400"}`}>{status.message}</p>}
          {!valid && (
            <p className="text-xs text-amber-400 mt-2">
              That doesn&apos;t look like a full JWT (long, with two dots). Pinata&apos;s classic &quot;API Key&quot; + &quot;Secret&quot; pair won&apos;t work — copy the{" "}
              <b>JWT</b>.
            </p>
          )}
          <p className="hint">
            Kept only in this browser (until you close the tab, or on this device if you allowed optional storage) and sent only to api.pinata.cloud. Free key:{" "}
            <a href="https://app.pinata.cloud/developers/api-keys" target="_blank" rel="noreferrer" className="text-accent-400 underline">
              app.pinata.cloud/developers/api-keys
            </a>{" "}
            (needs the pinFileToIPFS permission).
          </p>
        </div>
      )}
    </div>
  );
}
