/**
 * Partner key CLI (D-111). Usage:
 *   tsx scripts/partner.ts add <name> [--id <partner-id>] [--origin <https-origin>]...
 *   tsx scripts/partner.ts rotate <partner-id> --scope pub|srv
 *   tsx scripts/partner.ts revoke <partner-id>
 *   tsx scripts/partner.ts list [--check]   (marks partners whose id is now reserved; --check exits 1 when any active partner is flagged)
 * Reads MONGODB_URL, VC_PARTNER_KEY_PEPPER and (optional) VC_RESERVED_TENANT_IDS and VC_PARTNER_OWN_TENANTS from the environment and writes only the `partners` collection of the virtual_counsellor database.
 * New keys are printed once (add prints a page key and a server key; rotate prints one); they are never stored: the database keeps its HMAC hash only. Exit 0 = done, 1 = refused or failed, 2 = bad usage.
 */
import { connectFromEnv } from "@vc/db";
import { PARTNER_PEPPER_ENV, PartnerConfigError, PartnerError, createMongoPartnerStore, partnerOwnTenantsFromEnv, partnerPepperFromEnv, reservedTenantIdsFromEnv, runPartnerCli } from "../src/partners.js";

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error("usage: partner add <name> [--id <id>] [--origin <origin>]... | rotate <id> | revoke <id> | list [--check]");
    return 2;
  }
  const pepper = partnerPepperFromEnv(process.env);
  if (pepper === undefined) {
    console.error(`${PARTNER_PEPPER_ENV} is not set`);
    return 1;
  }
  // The configured tenant ids (VC_RESERVED_TENANT_IDS) are read here, before connecting, so `add` refuses an id that is a tenant without any flag. A malformed list is exit 1.
  let reservedIds: string[];
  let ownTenants: string[];
  try {
    reservedIds = reservedTenantIdsFromEnv(process.env);
    ownTenants = partnerOwnTenantsFromEnv(process.env);
  } catch (err) {
    if (err instanceof PartnerConfigError) {
      console.error(err.message);
      return 1;
    }
    throw err;
  }
  const { client, db } = connectFromEnv(process.env);
  try {
    await client.connect();
    const lines = await runPartnerCli(argv, { store: createMongoPartnerStore(db), pepper, reservedIds, ownTenants, warn: (line) => console.error(`warning: ${line}`) });
    for (const line of lines) console.log(line);
    return 0;
  } catch (err) {
    if (err instanceof PartnerError) {
      console.error(err.message);
      return err.code === "usage" ? 2 : 1;
    }
    throw err;
  } finally {
    await client.close();
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof Error ? `${err.name}: ${err.message}` : "partner: failed");
    process.exit(1);
  },
);
