"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { urlBase64ToUint8Array } from "@/lib/utils/push";
import { upsertPushSubscription } from "@/lib/actions/push-subscriptions";
import { completeOnboarding } from "@/lib/actions/onboarding";

type Step = "notifications" | "explainer" | "done";

// One-time, right-after-signup sequence: notification-permission prompt,
// then a brief app explainer. Shown once (profiles.onboarded_at is null),
// then never again -- app/(app)/goals/page.tsx only renders this when that
// column is null, and this component marks it complete on the final step.
export function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("notifications");
  const [isPending, startTransition] = useTransition();
  const [pushErrorMessage, setPushErrorMessage] = useState("");

  function finish() {
    setStep("done");
    startTransition(async () => {
      await completeOnboarding();
      router.refresh();
    });
  }

  function handleEnableNotifications() {
    setPushErrorMessage("");

    startTransition(async () => {
      try {
        if (
          !("serviceWorker" in navigator) ||
          !("PushManager" in window) ||
          typeof Notification === "undefined"
        ) {
          // Not supported on this device/browser -- just move on.
          setStep("explainer");
          return;
        }

        if (Notification.permission === "default") {
          const permission = await Notification.requestPermission();
          if (permission !== "granted") {
            setStep("explainer");
            return;
          }
        } else if (Notification.permission === "denied") {
          setStep("explainer");
          return;
        }

        const registration = await navigator.serviceWorker.register("/sw.js");
        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });

        const json = subscription.toJSON();
        if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
          await upsertPushSubscription({
            endpoint: json.endpoint,
            p256dh: json.keys.p256dh,
            auth: json.keys.auth,
          });
        }

        setStep("explainer");
      } catch (err) {
        console.error("Onboarding push subscribe failed", err);
        setPushErrorMessage("Could not enable notifications right now.");
        setStep("explainer");
      }
    });
  }

  if (step === "done") return null;

  return (
    <>
      <Dialog
        open={step === "notifications"}
        onClose={() => setStep("explainer")}
        title="Stay in the loop"
      >
        <p className="mb-4 text-sm text-foreground">
          Want to get notified when family members check in, react, or
          comment? You can always change this later in Settings.
        </p>
        {pushErrorMessage && (
          <p className="mb-3 text-sm text-red-600">{pushErrorMessage}</p>
        )}
        <div className="flex gap-3">
          <Button
            type="button"
            disabled={isPending}
            onClick={handleEnableNotifications}
          >
            {isPending ? "Working..." : "Enable notifications"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={isPending}
            onClick={() => setStep("explainer")}
          >
            Not now
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={step === "explainer"}
        onClose={finish}
        title="Welcome to Hansen Health"
      >
        <ul className="mb-5 flex flex-col gap-2 text-sm text-foreground">
          <li>
            <span className="font-medium">Set goals</span> — pick a template
            or create your own, and choose how many times a week you want to
            hit it.
          </li>
          <li>
            <span className="font-medium">Check in</span> — log a check-in
            each day you complete a goal. Add details like calories,
            distance, or a note if you want.
          </li>
          <li>
            <span className="font-medium">See the family&apos;s progress</span>{" "}
            — everyone&apos;s summary bars and activity feed live on the
            dashboard, with likes and comments to cheer each other on.
          </li>
          <li>
            <span className="font-medium">Win the monthly prize</span> — hit
            100% of your target for the month to win. Everyone who hits it,
            wins.
          </li>
        </ul>
        <Button type="button" disabled={isPending} onClick={finish}>
          {isPending ? "Getting started..." : "Let's go"}
        </Button>
      </Dialog>
    </>
  );
}
