import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parse } from "yaml";

// This is a static-file guard (parses infra/langfuse/docker-compose.yml offline; no docker, no
// network) proving the compose file itself still holds the standard rule 5 / D-004 MUSTs, as a
// second independent check alongside loadTracingConfig()'s code-level cloud-host refusal.

const here = path.dirname(fileURLToPath(import.meta.url));
const composePath = path.resolve(here, "../../../infra/langfuse/docker-compose.yml");
const compose = parse(readFileSync(composePath, "utf8")) as {
  services: Record<string, { environment?: Record<string, unknown>; ports?: unknown[] }>;
};

test("docker-compose.yml defines langfuse-web and langfuse-worker", () => {
  assert.ok(compose.services["langfuse-web"], "langfuse-web service missing");
  assert.ok(compose.services["langfuse-worker"], "langfuse-worker service missing");
});

for (const service of ["langfuse-web", "langfuse-worker"]) {
  test(`${service} sets TELEMETRY_ENABLED to "false"`, () => {
    const env = compose.services[service].environment ?? {};
    assert.equal(
      String(env.TELEMETRY_ENABLED),
      "false",
      `${service}.environment.TELEMETRY_ENABLED must be the literal string "false"`,
    );
  });
}

test("no service sets LANGFUSE_EE_LICENSE_KEY (OSS edition only, MUST b)", () => {
  for (const [name, service] of Object.entries(compose.services)) {
    const env = service.environment ?? {};
    assert.equal(
      Object.prototype.hasOwnProperty.call(env, "LANGFUSE_EE_LICENSE_KEY"),
      false,
      `service "${name}" must not set LANGFUSE_EE_LICENSE_KEY`,
    );
  }
});

test("every published port is bound to 127.0.0.1 (MUST d)", () => {
  let checkedAtLeastOnePort = false;
  for (const [name, service] of Object.entries(compose.services)) {
    for (const portEntry of service.ports ?? []) {
      checkedAtLeastOnePort = true;
      const entry = String(portEntry);
      // Compose short syntax is "HOST_IP:HOST_PORT:CONTAINER_PORT" (or without HOST_IP, which is
      // exactly the unsafe case this test exists to catch).
      const parts = entry.split(":");
      assert.equal(
        parts.length,
        3,
        `service "${name}" port "${entry}" must include an explicit host IP ` +
          `(HOST_IP:HOST_PORT:CONTAINER_PORT), not just HOST_PORT:CONTAINER_PORT`,
      );
      assert.equal(
        parts[0],
        "127.0.0.1",
        `service "${name}" port "${entry}" must bind to 127.0.0.1, not "${parts[0]}"`,
      );
    }
  }
  assert.equal(checkedAtLeastOnePort, true, "no ports were found to check — guard is vacuous");
});
