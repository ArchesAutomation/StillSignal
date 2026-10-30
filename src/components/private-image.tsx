"use client";
import { useEffect, useState } from "react";
import { privateFile } from "@/lib/private-files";
export default function PrivateImage({
  path,
  owner,
  name = "Original chart at record press",
  thumbnail = false,
}: {
  path: string;
  owner: string;
  name?: string;
  thumbnail?: boolean;
}) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true,
      u = "";
    void privateFile(path, owner)
      .then((blob) => {
        u = URL.createObjectURL(blob);
        if (alive) setUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => {
        if (alive)
          setError(
            "Original image is unavailable on this device. A JSON backup contains the reference only.",
          );
      });
    return () => {
      alive = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [path, owner]);
  if(thumbnail) return url ? <img src={url} alt={name}/> : <span aria-hidden="true">↗</span>;
  return (
    <div className="ss-original-image">
      {url && (
        <>
          <a href={url} target="_blank" rel="noopener noreferrer">
            <img src={url} alt={name} />
          </a>
          <a href={url} download="still-signal-original-chart.png">
            Download original PNG
          </a>
        </>
      )}
      {error && <p role="status">{error}</p>}
    </div>
  );
}
