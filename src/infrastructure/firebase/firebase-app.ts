import { getApps, initializeApp } from "firebase-admin/app";
import { Firestore, getFirestore } from "firebase-admin/firestore";
import { Messaging, getMessaging } from "firebase-admin/messaging";

export interface FirebaseApp {
  db: Firestore;
  messaging: Messaging;
}

/**
 * Initialises once per container, not per invocation.
 *
 * Written against the modular entry points rather than the `admin.firestore()`
 * namespace, which firebase-admin removed in v14.
 */
export function initializeFirebaseApp(): FirebaseApp {
  if (getApps().length === 0) {
    initializeApp();
  }
  return { db: getFirestore(), messaging: getMessaging() };
}
