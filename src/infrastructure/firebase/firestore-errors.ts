/** gRPC status code for ALREADY_EXISTS, which Firestore surfaces on `create`. */
const GRPC_ALREADY_EXISTS = 6;

export function isAlreadyExistsError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const { code, message } = err as { code?: unknown; message?: unknown };
  return code === GRPC_ALREADY_EXISTS ||
    (typeof message === "string" && message.includes("ALREADY_EXISTS"));
}
