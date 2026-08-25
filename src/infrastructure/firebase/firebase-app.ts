import * as admin from "firebase-admin";

export interface FirebaseApp {
  db: admin.firestore.Firestore;
  messaging: admin.messaging.Messaging;
}

export function initializeFirebaseApp(): FirebaseApp {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return { db: admin.firestore(), messaging: admin.messaging() };
}
