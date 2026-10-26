"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type PictureWindow = Window & {
  documentPictureInPicture?: {
    requestWindow: (options: {
      width: number;
      height: number;
    }) => Promise<Window>;
  };
};

// Keep one portal host for both documents: moving it never remounts the editor.
export function useFloatingJournal() {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [floating, setFloating] = useState(false);
  const [message, setMessage] = useState("");
  const hostRef = useRef<HTMLDivElement | null>(null);
  const pipRef = useRef<Window | null>(null);
  const pending = useRef(false);
  const alive = useRef(true);
  const generation = useRef(0);
  const windowCleanup = useRef<(() => void) | null>(null);

  const dock = useCallback(() => {
    windowCleanup.current?.();
    windowCleanup.current = null;
    const node = hostRef.current;
    if (node) {
      node.dataset.floating = "false";
      document.body.append(node);
    }
    pipRef.current = null;
    if (alive.current) {
      setFloating(false);
      setMessage("");
    }
  }, []);

  const ensureHost = useCallback(() => {
    let node = hostRef.current;
    if (!node) {
      node = document.createElement("div");
      node.className = "floating-journal-host";
      document.body.append(node);
      hostRef.current = node;
      setHost(node);
    }
    node.hidden = false;
    return node;
  }, []);

  const adoptWindow = useCallback(
    (target: Window, popup: boolean) => {
      const node = ensureHost();
      pipRef.current = target;
      target.document.title = "Still Signal · Session dashboard";
      const base = target.document.createElement("base");
      base.href = document.baseURI;
      target.document.head.append(base);
      for (const style of document.querySelectorAll(
        'style, link[rel="stylesheet"]',
      ))
        target.document.head.append(style.cloneNode(true));
      target.document.documentElement.lang = document.documentElement.lang;
      node.dataset.floating = "true";
      target.document.body.append(node);
      const restore = () => {
        if (pipRef.current === target) dock();
      };
      target.addEventListener("pagehide", restore, { once: true });
      const timer = popup
        ? window.setInterval(() => {
            if (target.closed) restore();
          }, 500)
        : undefined;
      windowCleanup.current = () => {
        target.removeEventListener("pagehide", restore);
        if (timer !== undefined) window.clearInterval(timer);
      };
      setFloating(true);
      setMessage(
        popup
          ? "Opened in a regular popup. Keep this tab open; this window is not always on top."
          : "",
      );
    },
    [dock, ensureHost],
  );

  const openPopup = useCallback(() => {
    if (pipRef.current && !pipRef.current.closed) {
      pipRef.current.focus();
      return;
    }
    if (pending.current) return;
    ensureHost();
    let popup: Window | null = null;
    try {
      // Called on this click, never after a rejected PiP promise consumes activation.
      popup = window.open(
        "about:blank",
        "_blank",
        "popup,width=230,height=120",
      );
      if (!popup) throw new Error("Popup blocked");
      adoptWindow(popup, true);
    } catch {
      popup?.close();
      dock();
      setMessage(
        "Floating windows are unavailable or blocked. Your dashboard works here; click Open popup window to retry, or use Chrome or Edge for an always-on-top window.",
      );
    }
  }, [adoptWindow, dock, ensureHost]);

  const open = useCallback(async () => {
    if (pipRef.current && !pipRef.current.closed) {
      pipRef.current.focus();
      return;
    }
    if (pending.current) return;
    ensureHost();
    const api = (window as PictureWindow).documentPictureInPicture;
    if (!api) {
      openPopup();
      return;
    }
    pending.current = true;
    const request = ++generation.current;
    try {
      // This must run before session storage/network awaits consume the click.
      const pip = await api.requestWindow({ width: 230, height: 120 });
      if (!alive.current || request !== generation.current) {
        pip.close();
        return;
      }
      adoptWindow(pip, false);
    } catch {
      if (alive.current && request === generation.current) {
        dock();
        setMessage(
          "The floating window could not open. Your dashboard works here; click Open popup window to use a regular window.",
        );
      }
    } finally {
      pending.current = false;
    }
  }, [adoptWindow, dock, ensureHost, openPopup]);

  const close = useCallback(() => {
    generation.current++;
    const pip = pipRef.current;
    dock();
    pip?.close();
  }, [dock]);

  useEffect(() => {
    alive.current = true;
    const leavePage = () => pipRef.current?.close();
    window.addEventListener("pagehide", leavePage);
    return () => {
      alive.current = false;
      window.removeEventListener("pagehide", leavePage);
      generation.current++;
      windowCleanup.current?.();
      windowCleanup.current = null;
      pipRef.current?.close();
      hostRef.current?.remove();
    };
  }, []);

  return { host, floating, message, open, openPopup, close };
}
