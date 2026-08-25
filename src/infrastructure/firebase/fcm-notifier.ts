import type { Messaging } from "firebase-admin/messaging";
import { Logger } from "../../domain/ports/logger";
import { Notifier, PushNotification } from "../../domain/ports/notifier";

export class FcmNotifier implements Notifier {
  constructor(
    private readonly messaging: Messaging,
    private readonly logger: Logger,
  ) {}

  async send(notification: PushNotification, context: string): Promise<void> {
    try {
      const messageId = await this.messaging.send({
        topic: notification.topic,
        ...(notification.notification ? { notification: notification.notification } : {}),
        data: notification.data,
      });
      this.logger.info(`FCM sent (${context})`, { messageId });
    } catch (err) {
      this.logger.error(`FCM send failed (${context}) — non-fatal`, err);
    }
  }
}
