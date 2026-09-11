import { useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  ScanLine,
  SwitchCamera,
  ArrowRight,
  LoaderCircle,
} from "lucide-react";

export default function Scanner({ onScan, paused }) {
  const video = useRef(null),
    controls = useRef(null),
    stream = useRef(null),
    read = useRef(onScan),
    locked = useRef(false);
  const [facing, setFacing] = useState("user"),
    [enabled, setEnabled] = useState(true),
    [restart, setRestart] = useState(0);
  const [state, setState] = useState("starting"),
    [error, setError] = useState(""),
    [actualFacing, setActualFacing] = useState("user");
  useEffect(() => {
    read.current = onScan;
  }, [onScan]);
  useEffect(() => {
    if (paused || !enabled) return;
    let cancelled = false;
    locked.current = false;
    const stop = () => {
      controls.current?.stop();
      controls.current = null;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
    async function start() {
      setState("starting");
      setError("");
      if (!navigator.mediaDevices?.getUserMedia) {
        setState("error");
        setError(
          window.isSecureContext
            ? "Camera scanning is unavailable in this browser. Enter a barcode below."
            : "Camera access needs an HTTPS connection. Enter a barcode below.",
        );
        return;
      }
      try {
        const [
          { BrowserMultiFormatReader },
          { BarcodeFormat, DecodeHintType },
        ] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        if (cancelled) return;
        const media = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        });
        if (cancelled) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = media;
        setActualFacing(
          media.getVideoTracks()[0]?.getSettings().facingMode || facing,
        );
        const hints = new Map([
          [
            DecodeHintType.POSSIBLE_FORMATS,
            [
              BarcodeFormat.CODE_128,
              BarcodeFormat.CODE_39,
              BarcodeFormat.ITF,
              BarcodeFormat.EAN_13,
              BarcodeFormat.EAN_8,
              BarcodeFormat.UPC_A,
              BarcodeFormat.UPC_E,
              BarcodeFormat.CODABAR,
              BarcodeFormat.QR_CODE,
            ],
          ],
          [DecodeHintType.TRY_HARDER, true],
        ]);
        const reader = new BrowserMultiFormatReader(hints, {
          delayBetweenScanAttempts: 180,
          delayBetweenScanSuccess: 1200,
        });
        const control = await reader.decodeFromStream(
          media,
          video.current,
          (result) => {
            if (cancelled || !result || locked.current) return;
            const value = result.getText().trim();
            if (!value) return;
            locked.current = true;
            navigator.vibrate?.(45);
            read.current(value);
          },
        );
        if (cancelled) {
          control.stop();
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        controls.current = control;
        setState("ready");
      } catch (e) {
        stop();
        if (cancelled) return;
        setState("error");
        setError(
          e.name === "NotAllowedError"
            ? "Camera access is blocked. Allow it in your browser settings, or enter the barcode below."
            : e.name === "NotFoundError"
              ? "No camera found. Connect a camera or enter the barcode below."
              : "The camera could not start. Close other camera apps, then try again.",
        );
      }
    }
    start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [facing, enabled, paused, restart]);
  const cameraOn = state === "ready" && enabled && !paused;
  return (
    <section className="scanner" aria-label="Barcode scanner">
      <video
        ref={video}
        autoPlay
        muted
        playsInline
        className={actualFacing === "user" ? "mirrored" : ""}
      />
      <div className="scanner-shade" />
      <div className="scanner-top">
        <span className="scanner-label">
          <ScanLine size={17} /> MEMBER BARCODE
        </span>
        <span className="camera-label">
          {actualFacing === "user" ? "Front camera" : "Rear camera"}
        </span>
      </div>
      <div className="scanner-center">
        <div className={"scan-window " + (cameraOn ? "live" : "")}>
          <i />
          <i />
          <i />
          <i />
          {!cameraOn &&
            (state === "starting" && enabled ? (
              <LoaderCircle size={34} className="spin" />
            ) : (
              <ScanLine size={54} strokeWidth={1.2} />
            ))}
          {cameraOn && <span className="scan-sweep" />}
        </div>
        <h2>
          {paused
            ? "Member identified"
            : !enabled
              ? "Camera paused"
              : state === "error"
                ? "Use your member barcode"
                : cameraOn
                  ? "Hold your barcode in the frame"
                  : "Opening your camera"}
        </h2>
        <p>
          {state === "error"
            ? error
            : cameraOn
              ? "Keep the entire barcode visible and hold still."
              : "Your camera is only used to read barcodes."}
        </p>
        {state === "error" && (
          <button
            className="scanner-retry"
            onClick={() => setRestart((v) => v + 1)}
          >
            <Camera size={16} /> Try camera again <ArrowRight size={15} />
          </button>
        )}
      </div>
      <div className="scanner-bottom">
        <span>
          <span className={"status-dot " + (cameraOn ? "on" : "")} />
          {cameraOn
            ? "Ready to scan"
            : state === "starting" && enabled
              ? "Connecting"
              : "Manual entry available"}
        </span>
        <div>
          <button
            aria-label="Switch camera"
            title="Switch camera"
            onClick={() => {
              setFacing((f) => (f === "user" ? "environment" : "user"));
              setEnabled(true);
            }}
          >
            <SwitchCamera size={19} />
          </button>
          <button
            aria-label={enabled ? "Pause camera" : "Start camera"}
            title={enabled ? "Pause camera" : "Start camera"}
            onClick={() => setEnabled((x) => !x)}
          >
            {enabled ? <CameraOff size={18} /> : <Camera size={18} />}
          </button>
        </div>
      </div>
    </section>
  );
}
