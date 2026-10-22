/**
 * Partner key CLI (D-111). Usage:
 *   tsx scripts/partner.ts add <name> [--id <partner-id>] [--origin <https-origin>]...
 *   tsx scripts/partner.ts rotate <partner-id> --scope pub|srv
 *   tsx scripts/partner.ts revoke <partner-id>
 *   tsx scripts/partner.ts list
 * Reads MONGODB_URL and VC_PARTNER_KEY_PEPPER from the environment and writes only the `partners` collection of the virtual_counsellor database.
 * New keys are printed once (add prints a page key and a server key; rotate prints one); they are never stored: the database keeps its HMAC hash only. Exit 0 = done, 1 = refused or failed, 2 = bad usage.
 */
import { connectFromEnv } from "@vc/db";
import { PARTNER_PEPPER_ENV, PartnerError, createMongoPartnerStore, partnerPepperFromEnv, runPartnerCli } from "../src/partners.js";

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  if (argv.length === 0) {
    console.error("usage: partner add <name> [--id <id>] [--origin <origin>]... | rotate <id> | revoke <id> | list");
    return 2;
  }
  const pepper = partnerPepperFromEnv(process.env);
  if (pepper === undefined) {
    console.error(`${PARTNER_PEPPER_ENV} is not set`);
    return 1;
  }
  const { client, db } = connectFromEnv(process.env);
  try {
    await client.connect();
    const lines = await runPartnerCli(argv, { store: createMongoPartnerStore(db), pepper });
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
