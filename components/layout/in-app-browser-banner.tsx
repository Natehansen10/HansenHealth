"use client";

import { useEffect, useState } from "react";

// In-app browsers (the Gmail / Google app / Facebook / Instagram embedded
// webviews) can't add a site to the home screen -- that capability only
// exists in the full Safari and Chrome apps, and no web API can force a link
// out of a webview into the real browser. So when we detect we're running
// inside one of those webviews, we show a small nudge explaining how to
// reopen in the real browser (where Add-to-Home-Screen / install actually
// works). This is the honest workaround for "I can't install from Gmail."
//
// Detection is best-effort UA sniffing -- there's no reliable feature test
// for "am I in an in-app webview," and UA strings shift over time, so this
// aims to catch the common cases (the ones users actually hit from an email
// link) without false-positiving on real Safari/Chrome.

const DISMISS_KEY = "inAppBrowserBannerDismissed";

type Detection = { inApp: boolean; ios: boolean };

function detect(): Detection {
  if (typeof navigator === "undefined") return { inApp: false, ios: false };

  const ua = navigator.userAgent || "";
  const ios = /iPhone|iPad|iPod/i.test(ua);

  // Real Safari/Chrome should NOT match these. Common in-app webview tokens:
  //   GSA        = Google Search App (the "Google" app)
  //   FBAN/FBAV  = Facebook
  //   Instagram  = Instagram
  //   Line, MicroMessenger (WeChat), etc.
  // Gmail's iOS webview is trickier: it often looks like plain Safari but
  // lacks the "Safari" token that real mobile Safari always includes, so on
  // iOS we also treat "WebKit but no Safari/CriOS/FxiOS token" as in-app.
  const knownInApp =
    /\b(GSA|FBAN|FBAV|FB_IAB|Instagram|Line|MicroMessenger|Twitter)\b/i.test(
      ua,
    );

  let iosWebView = false;
  if (ios) {
    const isRealSafari = /Safari/i.test(ua);
    const isRealChrome = /CriOS/i.test(ua); // Chrome on iOS
    const isRealFirefox = /FxiOS/i.test(ua); // Firefox on iOS
    // On iOS every browser is WebKit; a genuine standalone browser advertises
    // one of the tokens above. Missing all of them strongly implies a webview.
    iosWebView = !isRealSafari && !isRealChrome && !isRealFirefox;
  }

  return { inApp: knownInApp || iosWebView, ios };
}

type BannerState = { visible: boolean; ios: boolean };

const HIDDEN: BannerState = { visible: false, ios: false };

export function InAppBrowserBanner() {
  // Detection reads navigator/sessionStorage, which are browser-only, so it
  // must not run during SSR (would hydration-mismatch). Start hidden on both
  // server and first client render; reveal after mount if we're in a webview.
  const [state, setState] = useState<BannerState>(HIDDEN);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // sessionStorage (not localStorage) so it can reappear in a new session
    // if they still haven't switched browsers, but stays dismissed while they
    // keep reading in the webview this time.
    let alreadyDismissed = false;
    try {
      alreadyDismissed = sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      // Private mode etc. -- just treat as not dismissed.
    }
    if (alreadyDismissed) return;

    const { inApp, ios } = detect();
    if (!inApp) return;

    // Defer the reveal out of the effect's synchronous body so we don't
    // trigger a cascading render on mount (the detection is a one-shot
    // client-only read, not ongoing synchronization).
    const raf = requestAnimationFrame(() => setState({ visible: true, ios }));
    return () => cancelAnimationFrame(raf);
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Ignore storage failures -- worst case the banner shows again later.
    }
  }

  const { visible, ios } = state;
  if (!visible || dismissed) return null;

  const howTo = ios
    ? 'tap the "•••" menu above and choose "Open in Safari," then Share → Add to Home Screen.'
    : 'tap the "⋮" menu above and choose "Open in Chrome," then Menu → Add to Home screen.';

  return (
    <div className="border-b border-divider bg-accent-900 px-4 py-3 text-sm text-white">
      <div className="mx-auto flex max-w-2xl items-start justify-between gap-4">
        <p>
          <span className="font-medium">Add Hansen Health to your home screen:</span>{" "}
          you&apos;re viewing this inside an in-app browser, which can&apos;t
          install apps. To add it, {howTo}
        </p>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={dismiss}
          className="flex-shrink-0 text-white/70 hover:text-white"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
