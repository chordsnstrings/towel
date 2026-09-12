import { useEffect, useRef, useState } from "react";
import { Download, Share, WifiOff, X } from "lucide-react";

export default function PwaFeatures() {
  const [prompt, setPrompt] = useState(null);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [guide, setGuide] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(
    window.matchMedia("(display-mode: standalone)").matches ||
      !!navigator.standalone,
  );
  const dialog = useRef(null);
  const ios =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  useEffect(() => {
    const available = (event) => {
      event.preventDefault();
      setPrompt(event);
    };
    const completed = () => {
      setInstalled(true);
      setPrompt(null);
    };
    const online = () => setOffline(!navigator.onLine);
    window.addEventListener("beforeinstallprompt", available);
    window.addEventListener("appinstalled", completed);
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .catch(() => {});
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", available);
      window.removeEventListener("appinstalled", completed);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
    };
  }, []);
  useEffect(() => {
    if (guide) dialog.current?.showModal();
  }, [guide]);
  async function install() {
    if (!prompt) {
      setGuide(true);
      return;
    }
    try {
      await prompt.prompt();
      await prompt.userChoice;
    } catch {
      // A dismissed or expired browser prompt can be retried from its menu.
    } finally {
      setPrompt(null);
    }
  }
  return (
    <>
      {offline && (
        <div className="pwa-offline" role="status">
          <WifiOff size={18} />
          <span>
            You’re offline. Reconnect to record towel checkouts and returns.
          </span>
        </div>
      )}
      {!offline && !installed && !dismissed && (prompt || ios) && (
        <div className="pwa-install">
          <button className="text-button" onClick={install}>
            <Download size={18} /> Install app
          </button>
          <button
            className="icon-button"
            aria-label="Dismiss install suggestion"
            onClick={() => setDismissed(true)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {guide && (
        <dialog
          ref={dialog}
          className="modal pwa-guide"
          onCancel={() => setGuide(false)}
        >
          <div className="modal-heading">
            <h2>ADD TO HOME SCREEN</h2>
            <button
              className="icon-button"
              aria-label="Close install instructions"
              onClick={() => setGuide(false)}
            >
              <X size={20} />
            </button>
          </div>
          <p>
            In Safari, tap <Share size={17} /> <strong>Share</strong>, choose{" "}
            <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.
          </p>
          <p className="muted">
            Open MOVE Towels from your home screen for a full-screen desk. An
            internet connection is needed to record towels.
          </p>
          <button
            className="button primary full"
            onClick={() => setGuide(false)}
          >
            Got it
          </button>
        </dialog>
      )}
    </>
  );
}
