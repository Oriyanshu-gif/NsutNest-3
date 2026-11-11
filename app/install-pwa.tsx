"use client";

/**
 * PWA plumbing, shared by the website and the installed app.
 *
 * The service worker is registered once from the root layout. The install offer
 * is a dismissible banner inside the app shell rather than a floating button, so
 * it can never cover the profile or the bottom tab bar; it disappears entirely
 * in standalone mode.
 */

import { useEffect, useRef, useState } from "react";
import { Download, Smartphone, X } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISS_KEY = "nsutnest_install_dismissed_v1";
const INSTALL_EVENT = "nsutnest-install-request";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  );
}

export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("NSUT Nest service worker registration failed:", error);
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}

export function InstallBanner() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [standalone, setStandalone] = useState(false);
  const [checked, setChecked] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const closeHelpRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setStandalone(isStandalone());
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
    setChecked(true);

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setPrompt(null);
      setDismissed(true);
    };
    const onRequest = () => {
      void install();
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener(INSTALL_EVENT, onRequest);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener(INSTALL_EVENT, onRequest);
    };
    // `install` only reads the current prompt state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt]);

  useEffect(() => {
    if (!showHelp) return;
    closeHelpRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowHelp(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showHelp]);

  async function install() {
    if (!prompt) {
      setShowHelp(true);
      return;
    }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") setDismissed(true);
    setPrompt(null);
  }

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // The banner returns next visit; harmless.
    }
  }

  return (
    <>
      {checked && !standalone && !dismissed && (
        <aside className="installBanner" aria-label="Install NSUT Nest app">
          <span className="installBannerIcon" aria-hidden="true">
            {prompt ? <Download size={18} /> : <Smartphone size={18} />}
          </span>
          <span className="installBannerText">
            <b>Install NSUT Nest</b>
            <small>Attendance, results and notices one tap away — works offline for saved data.</small>
          </span>
          <span className="installBannerActions">
            <button className="installBannerPrimary" type="button" onClick={() => void install()}>
              Install
            </button>
            <button
              className="installBannerDismiss"
              type="button"
              onClick={dismiss}
              aria-label="Dismiss install banner"
            >
              <X size={16} />
            </button>
          </span>
        </aside>
      )}

      {showHelp && (
        <div
          className="pwaHelpBackdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowHelp(false);
          }}
        >
          <div className="pwaHelpCard" role="dialog" aria-modal="true" aria-labelledby="pwaHelpTitle">
            <button
              className="pwaHelpClose"
              type="button"
              onClick={() => setShowHelp(false)}
              aria-label="Close install instructions"
              ref={closeHelpRef}
            >
              <X size={18} />
            </button>
            <h2 id="pwaHelpTitle">Install NSUT Nest</h2>
            <p>
              <b>Android (Chrome):</b> open the browser menu (⋮), then choose <b>Install app</b> or{" "}
              <b>Add to Home screen</b>.
            </p>
            <p>
              <b>iPhone (Safari):</b> tap Share, then <b>Add to Home Screen</b>.
            </p>
            <p className="pwaHelpNote">
              Installation needs the deployed site over HTTPS. Once installed, NSUT Nest opens without browser
              chrome and keeps your saved attendance and notices available offline.
            </p>
            <button className="pwaHelpDone" type="button" onClick={() => setShowHelp(false)}>
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
