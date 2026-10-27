"use client";
import { useRef, useState } from "react";
import PrivateImage from "../private-image";
import { Screenshot } from "../reflection-editor";
import { cx } from "./shared";
export default function EvidenceImage({
  owner,
  path,
  name = "Original chart capture",
}: {
  owner: string;
  path: string;
  name?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [source, setSource] = useState("");
  return (
    <div
      className={cx("evidence-image")}
      onClickCapture={(e) => {
        if (
          (e.target as Element).closest("dialog") ||
          (e.target as Element).closest("a[download]")
        )
          return;
        const image = e.currentTarget.querySelector("img");
        if (image) {
          e.preventDefault();
          e.stopPropagation();
          setSource(image.currentSrc || image.src);
          dialog.current?.showModal();
        }
      }}
    >
      {path.startsWith("local-image:") ? (
        <PrivateImage owner={owner} path={path} name={name} />
      ) : (
        <Screenshot path={path} name={name} />
      )}
      <dialog
        ref={dialog}
        className={cx("evidence-dialog")}
        aria-label="Enlarged chart capture"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
      >
        <div>
          <span>{name}</span>
          <button
            aria-label="Close enlarged chart"
            onClick={() => dialog.current?.close()}
          >
            ×
          </button>
        </div>
        {source && <img src={source} alt={name} />}
      </dialog>
    </div>
  );
}
