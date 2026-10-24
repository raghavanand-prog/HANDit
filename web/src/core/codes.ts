// The message codes the page can show, exactly as listed in the protocol.
export const ERROR_CODES = [
  "LINK_INVALID",
  "LINK_UNSUPPORTED_VERSION",
  "CODE_EXPIRED",
  "CODE_ALREADY_USED",
  "CODE_NOT_ACTIVE",
  "SERVER_UNREACHABLE",
  "INTRO_TAMPERED",
  "P2P_FAILED",
  "PEER_LEFT",
  "CONNECTION_LOST",
  "OFFER_DECLINED",
  "OFFER_TIMEOUT",
  "CANCELLED_BY_PEER",
  "CANCELLED_BY_USER",
  "STORAGE_TOO_SMALL",
  "STORAGE_FULL",
  "DOWNLOAD_BLOCKED",
  "SOURCE_UNREADABLE",
  "INTEGRITY_FAILED",
  "LIMIT_EXCEEDED",
  "BROWSER_UNSUPPORTED",
  "UNKNOWN_ERROR",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const NOTICE_CODES = [
  "QUALITY_IDENTICAL",
  "INFO_IPHONE_ORIGINALS",
  "INFO_LOCATION_MAY_BE_HIDDEN",
  "INFO_HEIC_ON_WINDOWS",
  "INFO_LINK_SHARING",
] as const;
export type NoticeCode = (typeof NOTICE_CODES)[number];

/** A failure the page can explain: a code from the list, plus technical details for "Details". */
export class HanditError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly details = "",
  ) {
    super(details ? `${code}: ${details}` : code);
  }
}

export const toHanditError = (error: unknown): HanditError =>
  error instanceof HanditError ? error : new HanditError("UNKNOWN_ERROR", String(error));
