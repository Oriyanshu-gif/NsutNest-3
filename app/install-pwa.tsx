"use client";

import { useEffect, useState } from "react";
import { Download, Smartphone } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function InstallPwa() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      const registerServiceWorker = () => {
        navigator.serviceWorker.register("/sw.js").catch((error) => {
          console.error("NSUT Nest service worker registration failed:", error);
        });
      };
      if (document.readyState === "complete") registerServiceWorker();
      else window.addEventListener("load", registerServiceWorker, { once: true });
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));
    setInstalled(isStandalone);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!installPrompt) {
      setShowHelp(true);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setInstallPrompt(null);
  }

  if (installed) return null;
  return <>
    <button className="pwaInstallButton" type="button" onClick={install} aria-label="Install NSUT Nest app">
      {installPrompt ? <Download size={16} /> : <Smartphone size={16} />}
      <span>Install app</span>
    </button>
    {showHelp && <div className="pwaHelpBackdrop" role="dialog" aria-modal="true" aria-labelledby="pwaHelpTitle">
      <div className="pwaHelpCard">
        <button className="pwaHelpClose" onClick={() => setShowHelp(false)} aria-label="Close install instructions">×</button>
        <h2 id="pwaHelpTitle">Install NSUT Nest</h2>
        <p><b>Android (Chrome):</b> tap the browser menu (⋮), then choose <b>Install app</b> or <b>Add to Home screen</b>.</p>
        <p><b>iPhone (Safari):</b> tap Share, then <b>Add to Home Screen</b>.</p>
        <p className="pwaHelpNote">If these options are missing, open the deployed NSUT Nest website in a supported browser over HTTPS.</p>
        <button className="pwaHelpDone" onClick={() => setShowHelp(false)}>Got it</button>
      </div>
    </div>}
  </>;
}
