import { redactPii } from "./redact.ts";
for (const c of ["my name is s. kumar", "i am a. kumar", "my name is S. Kumar", "i am j. r. d. tata", "call me k. v. rao please", "my name is dr. s. kumar", "naam hai priya", "mera naam priya"]) { const r = redactPii(c); console.log(JSON.stringify(c), "=>", JSON.stringify(r.text)); }
