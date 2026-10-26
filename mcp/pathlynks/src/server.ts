/**
 * MCP face of the Pathlynks port. The student id is NEVER a tool argument: every tool takes an empty input, any extra
 * argument the model supplies is ignored, and the id comes from `resolveStudentId()`, which the host wires to the
 * verified auth context. No verified student -> the tool is refused and nothing is queried.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { PathlynksPort, PathlynksResult } from "./port.js";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

function reply(res: PathlynksResult): ToolResult {
  // Typed payload only: rows / truncated, or reason + fixed cause. Nothing from a driver error.
  return { content: [{ type: "text", text: JSON.stringify(res) }] };
}

export function createPathlynksServer(port: PathlynksPort, resolveStudentId: () => string | undefined): McpServer {
  const server = new McpServer({ name: "vc-pathlynks", version: "0.1.0" });
  const tool = (name: string, description: string, run: (studentId: string) => Promise<PathlynksResult>): void => {
    server.registerTool(name, { description, inputSchema: {} }, async (): Promise<ToolResult> => {
      const studentId = resolveStudentId();
      if (!studentId) {
        return { content: [{ type: "text", text: JSON.stringify({ ok: false, reason: "refused", cause: "no_verified_student" }) }], isError: true };
      }
      return reply(await run(studentId));
    });
  };
  tool("pathlynks_profile", "The signed-in student's Pathlynks profile (read-only).", (id) => port.getStudentProfile(id));
  tool("pathlynks_saved_careers", "The signed-in student's saved careers (read-only).", (id) => port.getSavedCareers(id));
  tool("pathlynks_compare", "The signed-in student's compare list (read-only).", (id) => port.getCompareList(id));
  tool("pathlynks_assessment", "The signed-in student's assessment status (read-only).", (id) => port.getAssessmentStatus(id));
  return server;
}
