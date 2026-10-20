"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type PictureWindow = Window & {
  documentPictureInPicture?: {
    requestWindow: (options: { width: number; height: number }) => Promise<Window>;
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

  const dock = useCallback(() => {
    const node = hostRef.current;
    if (node) {
      node.dataset.floating = "false";
      document.body.append(node);
    }
    pipRef.current = null;
    if (alive.current) setFloating(false);
  }, []);

  const open = useCallback(async () => {
    if (pipRef.current && !pipRef.current.closed) {
      pipRef.current.focus();
      return;
    }
    if (pending.current) return;
    let node = hostRef.current;
    if (!node) {
      node = document.createElement("div");
      node.className = "floating-journal-host";
      document.body.append(node);
      hostRef.current = node;
      setHost(node);
    }
    node.hidden = false;
    const api = (window as PictureWindow).documentPictureInPicture;
    if (!api) {
      setMessage("Floating windows are unavailable here. Your session dashboard is shown in this tab.");
      return;
    }
    pending.current = true;
    const request = ++generation.current;
    try {
      // This must run before session storage/network awaits consume the click.
      const pip = await api.requestWindow({ width: 380, height: 640 });
      if (!alive.current || request !== generation.current) {
        pip.close();
        return;
      }
      pipRef.current = pip;
      pip.document.title = "Still Signal · Session dashboard";
      for (const style of document.querySelectorAll('style, link[rel="stylesheet"]')) {
        pip.document.head.append(style.cloneNode(true));
      }
      pip.document.documentElement.lang = document.documentElement.lang;
      node.dataset.floating = "true";
      pip.document.body.append(node);
      pip.addEventListener("pagehide", dock, { once: true });
      setFloating(true);
      setMessage("");
    } catch {
      if (alive.current && request === generation.current) {
        dock();
        setMessage("The floating window could not open. Your session dashboard is here; use Reopen floating dashboard to retry.");
      }
    } finally {
      pending.current = false;
    }
  }, [dock]);

  const close = useCallback(() => {
    generation.current++;
    const pip = pipRef.current;
    dock();
    pip?.close();
  }, [dock]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
      pipRef.current?.close();
      hostRef.current?.remove();
    };
  }, []);

  return { host, floating, message, open, close };
}
