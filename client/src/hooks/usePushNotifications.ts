import { useState, useEffect } from 'react';
import { requestNotificationPermission, onMessageListener } from '@/lib/firebase';
import { toast } from 'sonner';

export function usePushNotifications() {
  const [notification, setNotification] = useState<any>(null);
  const [fcmToken, setFcmToken] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const token = await requestNotificationPermission();
      if (token) {
        setFcmToken(token);
        // TODO: Send this token to backend to associate with user
      }
    };

    init();

    const unsubscribe = onMessageListener().then((payload: any) => {
      setNotification(payload);
      toast(payload?.notification?.title || "New Notification", {
        description: payload?.notification?.body,
      });
    });

    // return () => {
    //   unsubscribe.catch(err => console.log('failed: ', err));
    // };
  }, []);

  return { fcmToken, notification };
}
