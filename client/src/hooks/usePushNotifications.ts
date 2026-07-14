import { useState, useEffect, useRef } from "react";
import { requestNotificationPermission, onMessageListener } from "@/lib/firebase";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export function usePushNotifications() {
  const [notification, setNotification] = useState<unknown>(null);
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const registeredToken = useRef<string | null>(null);

  const registerDevice = trpc.comms.registerDeviceToken.useMutation();

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const token = await requestNotificationPermission();
      if (cancelled || !token) return;

      setFcmToken(token);
      if (registeredToken.current === token) return;

      try {
        await registerDevice.mutateAsync({
          token,
          platform: "web",
          userAgent:
            typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        });
        registeredToken.current = token;
      } catch (error) {
        console.warn("[FCM] Failed to register device token with server", error);
      }
    };

    void init();

    void onMessageListener().then((payload: unknown) => {
      if (cancelled) return;
      setNotification(payload);
      const p = payload as {
        notification?: { title?: string; body?: string };
      };
      toast(p?.notification?.title || "New Notification", {
        description: p?.notification?.body,
      });
    });

    return () => {
      cancelled = true;
    };
    // registerDevice is stable enough for mount-once registration
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { fcmToken, notification };
}
