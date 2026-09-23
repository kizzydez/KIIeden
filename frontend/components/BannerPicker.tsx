"use client";

import { useEffect, useState } from "react";
import DropZone from "./DropZone";
import Icon from "./Icon";

/// Banner upload for a launch. Shown on Explore and on the collection / mint pages.
export default function BannerPicker({ file, onChange }: { file: File | null; onChange: (f: File | null) => void }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!file) {
      setUrl("");
      return;
    }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  return (
    <div>
      <p className="label" id="banner-label">
        Collection banner <span className="font-normal text-zinc-400">(wide image, 3:1 works best, e.g. 1500 x 500)</span>
      </p>
      <DropZone
        labelledBy="banner-label"
        accept="image/*"
        onFiles={(f) => {
          const img = f.find((x) => x.type.startsWith("image/"));
          if (img) onChange(img);
        }}
        label={file ? "Click or drop to replace the banner" : "Drop a banner image here, or click to browse"}
        hint="Displayed at the top of the Explore page, your collection page and your minting link."
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Preview of the banner image you selected" className="mx-auto mb-3 aspect-[3/1] w-full rounded-xl object-cover" />
        ) : (
          <Icon name="image" className="mx-auto mb-2 text-3xl text-zinc-400" />
        )}
      </DropZone>
      {file && (
        <button type="button" className="mt-2 text-xs text-zinc-400 hover:text-rose-300" onClick={() => onChange(null)}>
          Remove banner
        </button>
      )}
    </div>
  );
}
