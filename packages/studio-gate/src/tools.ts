/*
<MODULE_CONTRACT>
<purpose>
RFC-0555: Tool definitions for the Studio Gate MCP server. Each tool maps to
a Site OS command and declares its input schema as JSON Schema for MCP.
</purpose>
<non-goals>
  <item>Does not execute commands — executor.ts handles that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0555: initial 12 tool definitions.</item>
</CHANGE_SUMMARY>
*/

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
}

export const STUDIO_GATE_TOOLS: ToolDefinition[] = [
  {
    name: "workpiece.read",
    description:
      "Read a file from a mission workpiece. The path must be within the client-editable surface (DNA-22).",
    inputSchema: {
      type: "object",
      properties: {
        mission: { type: "string", description: "Mission id." },
        path: { type: "string", description: "Relative path within workpiece (e.g. src/content/pages/home.md)." },
      },
      required: ["mission", "path"],
    },
  },
  {
    name: "workpiece.write",
    description:
      "Write a file to a mission workpiece. Content is passed via stdin. The path must be within the client-editable surface (DNA-22). Does NOT auto-commit — call mission.git.commit separately.",
    inputSchema: {
      type: "object",
      properties: {
        mission: { type: "string", description: "Mission id." },
        path: { type: "string", description: "Relative path within workpiece." },
        content: { type: "string", description: "File content to write (passed via stdin to the command)." },
      },
      required: ["mission", "path", "content"],
    },
  },
  {
    name: "mission.open",
    description: "Open a new mission for a Sternsystem.",
    inputSchema: {
      type: "object",
      properties: {
        system: { type: "string", description: "Sternsystem id." },
        brief: { type: "string", description: "Mission brief describing what to do." },
        actor: { type: "string", description: "Actor identity (default: agent)." },
      },
      required: ["system", "brief"],
    },
  },
  {
    name: "mission.materialize",
    description: "Materialize the workpiece from the pinned Sternsystem bundle.",
    inputSchema: {
      type: "object",
      properties: {
        mission: { type: "string", description: "Mission id." },
      },
      required: ["mission"],
    },
  },
  {
    name: "mission.git.commit",
    description: "Commit changes in the workpiece git repository.",
    inputSchema: {
      type: "object",
      properties: {
        mission: { type: "string", description: "Mission id." },
        message: { type: "string", description: "Commit message." },
      },
      required: ["mission", "message"],
    },
  },
  {
    name: "mission.validate",
    description: "Validate the materialized workpiece (runs build.prepare and build.check pipelines).",
    inputSchema: {
      type: "object",
      properties: {
        mission: { type: "string", description: "Mission id." },
      },
      required: ["mission"],
    },
  },
  {
    name: "mission.reconcile",
    description: "Reconcile validated workpiece data changes to the Sternsystem repo.",
    inputSchema: {
      type: "object",
      properties: {
        mission: { type: "string", description: "Mission id." },
      },
      required: ["mission"],
    },
  },
  {
    name: "mission.close",
    description: "Close an open mission after successful reconcile.",
    inputSchema: {
      type: "object",
      properties: {
        mission: { type: "string", description: "Mission id." },
        actor: { type: "string", description: "Actor identity (default: agent)." },
        release: { type: "string", description: "Release id produced by this mission." },
      },
      required: ["mission"],
    },
  },
  {
    name: "mission.abort",
    description: "Abort an open mission (creates git bundle evidence before state transition).",
    inputSchema: {
      type: "object",
      properties: {
        mission: { type: "string", description: "Mission id." },
        actor: { type: "string", description: "Actor identity (default: agent)." },
      },
      required: ["mission"],
    },
  },
  {
    name: "release.prepare",
    description: "Prepare a release from a validated mission workpiece.",
    inputSchema: {
      type: "object",
      properties: {
        mission: { type: "string", description: "Mission id." },
      },
      required: ["mission"],
    },
  },
  {
    name: "release.publish",
    description: "Publish a prepared release.",
    inputSchema: {
      type: "object",
      properties: {
        mission: { type: "string", description: "Mission id." },
      },
      required: ["mission"],
    },
  },
  {
    name: "leitstand.propagate",
    description: "Propagate a release to a deployment channel (alt or main).",
    inputSchema: {
      type: "object",
      properties: {
        mission: { type: "string", description: "Mission id." },
        channel: { type: "string", enum: ["alt", "main"], description: "Deployment channel." },
      },
      required: ["mission", "channel"],
    },
  },
];
