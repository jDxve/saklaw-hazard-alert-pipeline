export interface PushNotification {
  topic: string;
  notification?: { title: string; body: string };
  data: Record<string, string>;
}

export interface Notifier {
  send(notification: PushNotification, context: string): Promise<void>;
}
