/*
<MODULE_CONTRACT>
<purpose>
RFC-0555: Command executor for the Studio Gate MCP server. Executes Site OS
commands via child_process, passing content via stdin for workpiece.write.
</purpose>
<non-goals>
  <item>Does not define tool schemas — tools.ts handles that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0555: initial command executor.</item>
</CHANGE_SUMMARY>
*/

import { execFile } from "node:child_process";
import type { ExecFileException } from "node:child_process";

export interface ExecuteCommandOptions {
  cwd: string;
  stdin?: string;
}

export interface ExecuteCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function executeCommand(
  command: string,
  args: string[],
  options: ExecuteCommandOptions,
): Promise<ExecuteCommandResult> {
  return new Promise((resolve) => {
    const child = execFile(
      command,
      args,
      {
        cwd: options.cwd,
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          const err = error as ExecFileException;
          resolve({
            stdout: stdout ?? "",
            stderr: stderr ?? err.message,
            exitCode: typeof err.code === "number" ? err.code : 1,
          });
        } else {
          resolve({ stdout: stdout ?? "", stderr: stderr ?? "", exitCode: 0 });
        }
      },
    );

    if (child.stdin && options.stdin !== undefined) {
      child.stdin.write(options.stdin);
      child.stdin.end();
    }
  });
}
