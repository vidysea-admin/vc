/**
 * B4 (contract): a session cannot be processed without a recorded consent row
 * covering the purpose in question, and a minor's consent needs
 * guardianConsent. ConsentSchema (packages/schemas) already refuses to store
 * a minor consent row with guardianConsent: false at write time — this
 * read-time check is a second, independent gate for callers about to process
 * a session, and it also defends against a consent row that reached the
 * collection some other way (e.g. a migration) without going through
 * validateConsentForWrite.
 */
import type { Db } from "mongodb";
import { consentsCollection } from "./collections.js";

export class ConsentRequiredError extends Error {
  constructor(studentId: string, purpose: string, reason: string) {
    super(
      `ConsentRequiredError: student "${studentId}" has no valid recorded consent covering purpose ` +
        `"${purpose}" (${reason}) — contract B4, no session may be processed without one.`,
    );
    this.name = "ConsentRequiredError";
  }
}

/**
 * Throws ConsentRequiredError unless a consent row exists for `studentId`
 * that (a) lists `purpose` in its `purposes` array, and (b) if the student is
 * a minor, has `guardianConsent: true`. Resolves with no value otherwise.
 */
export async function requireConsent(db: Db, studentId: string, purpose: string): Promise<void> {
  const consent = await consentsCollection(db).findOne({ studentId });
  if (!consent) {
    throw new ConsentRequiredError(studentId, purpose, "no consent row found");
  }
  if (!consent.purposes.includes(purpose)) {
    throw new ConsentRequiredError(studentId, purpose, "the recorded consent does not cover this purpose");
  }
  if (consent.minor && !consent.guardianConsent) {
    throw new ConsentRequiredError(studentId, purpose, "student is a minor and guardianConsent is not recorded");
  }
}
