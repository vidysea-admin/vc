// BLOCK: Verification prerequisites are missing from the supplied excerpts.
// tick.mjs:1709 requires DELIVERY_VERSION, but its value is omitted.
// tick.mjs:1719 delegates identity-file admission to deliveryIdentityPath,
// but that helper's permitted paths and constraints are omitted.
// Supply those definitions so the independent fixture can satisfy admission
// without guessing or weakening identity checks. Tool use was prohibited;
// no execution occurred, and no PASS/FAIL verdict is justified.