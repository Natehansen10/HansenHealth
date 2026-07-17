"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { urlBase64ToUint8Array } from "@/lib/utils/push";
import {
  deletePushSubscription,
  upsertPushSubscription,
} from "@/lib/actions/push-subscriptions";

type SupportState = "checking" | "unsupported" | "supported";

export function PushSubscribeButton() {
  const [support, setSupport] = useState<SupportState>("checking");
  const [subscribed, setSubscribed] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function checkSupportAndSubscription() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) {
          setSupport("unsupported");
        }
        return;
      }

      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) {
          setSupport("supported");
          setSubscribed(Boolean(existing));
        }
      } catch (err) {
        console.error("Failed to check push subscription state", err);
        if (!cancelled) {
          setSupport("supported");
        }
      }
    }

    checkSupportAndSubscription();

    return () => {
      cancelled = true;
    };
  }, []);

  function handleSubscribe() {
    setErrorMessage("");

    startTransition(async () => {
      try {
        if (Notification.permission === "default") {
          const permission = await Notification.requestPermission();
          if (permission !== "granted") {
            setErrorMessage("Notification permission was not granted.");
            return;
          }
        } else if (Notification.permission === "denied") {
          setErrorMessage(
            "Notifications are blocked for this site in your browser settings.",
          );
          return;
        }

        const registration = await navigator.serviceWorker.register("/sw.js");
        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });

        const json = subscription.toJSON();
        if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
          setErrorMessage("Push subscription is missing required fields.");
          return;
        }

        const { error } = await upsertPushSubscription({
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth: json.keys.auth,
        });

        if (error) {
          setErrorMessage(error);
          return;
        }

        setSubscribed(true);
      } catch (err) {
        console.error("Push subscribe failed", err);
        setErrorMessage("Could not subscribe to push notifications.");
      }
    });
  }

  function handleUnsubscribe() {
    setErrorMessage("");

    startTransition(async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const subscription = await registration.pushManager.getSubscription();

        if (subscription) {
          const endpoint = subscription.endpoint;
          await subscription.unsubscribe();
          const { error } = await deletePushSubscription(endpoint);
          if (error) {
            setErrorMessage(error);
            return;
          }
        }

        setSubscribed(false);
      } catch (err) {
        console.error("Push unsubscribe failed", err);
        setErrorMessage("Could not unsubscribe from push notifications.");
      }
    });
  }

  if (support === "checking") {
    return null;
  }

  if (support === "unsupported") {
    return (
      <p className="text-sm text-muted">
        Push notifications aren&apos;t supported in this browser.
      </p>
    );
  }

  return (
    <div>
      <Button
        type="button"
        variant={subscribed ? "secondary" : "primary"}
        disabled={isPending}
        onClick={subscribed ? handleUnsubscribe : handleSubscribe}
      >
        {isPending
          ? "Working..."
          : subscribed
            ? "Unsubscribe this device"
            : "Enable push on this device"}
      </Button>
      {errorMessage && (
        <p className="mt-2 text-sm text-red-600">{errorMessage}</p>
      )}
    </div>
  );
}
