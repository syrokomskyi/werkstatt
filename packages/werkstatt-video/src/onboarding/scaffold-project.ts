/*
<MODULE_CONTRACT>
<purpose>Editframe project scaffold hook — generates a new Editframe composition project with boilerplate (RFC-0778).</purpose>
<keywords>scaffold, onboarding, video, editframe</keywords>
<responsibilities>
  <item>Creates src/composition.tsx with a minimal Editframe React composition.</item>
  <item>Creates src/assets/manifest.yaml with an empty manifest skeleton.</item>
  <item>Creates editframe.config.ts with render settings (codec, container, resolution, fps, bitrate).</item>
  <item>Creates package.json, tsconfig.json, vite.config.ts for the composition project.</item>
</responsibilities>
<non-goals>
  <item>Does not install dependencies — the consumer runs pnpm install after scaffold.</item>
  <item>Does not create video content — compositions are projects, not plugin content.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0778: Editframe project scaffold — composition.tsx, asset manifest, editframe.config.ts, package.json, tsconfig.json, vite.config.ts.</item>
</CHANGE_SUMMARY>
*/

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PluginHookContext, HookResult } from "@warpgogol/werkstatt/plugin";

const COMPOSITION_TSX = `import { Configuration, Timegroup, Text, Workbench } from "@editframe/react";

const EFWorkbench = Workbench as any;
const EFConfiguration = Configuration as any;
const EFTimegroup = Timegroup as any;
const EFText = Text as any;

export default function Composition() {
  return (
    <EFWorkbench resolution="1920x1080">
      <EFConfiguration>
        <EFTimegroup
          id="root"
          duration="10s"
          mode="contain"
          fps={30}
          style={{
            width: "1920px",
            height: "1080px",
            background: "#000",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <EFText
            duration="10s"
            style={{
              color: "white",
              fontSize: "72px",
              textAlign: "center",
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
            }}
          >
            Hello, Editframe!
          </EFText>
        </EFTimegroup>
      </EFConfiguration>
    </EFWorkbench>
  );
}
`;

const EDITFRAME_CONFIG_TS = `export interface EditframeRenderConfig {
  codec: string;
  container: string;
  resolution: string;
  fps: number;
  bitrate: string;
  ffmpegVersion: string;
}

const config: EditframeRenderConfig = {
  codec: "h264",
  container: "mp4",
  resolution: "1920x1080",
  fps: 30,
  bitrate: "5M",
  ffmpegVersion: "6.1.2",
};

export default config;
`;

const MANIFEST_YAML = `# Asset manifest — list all composition assets here
# Each entry: { path: <relative-to-src/assets>, type: <image|audio|video|font> }
assets: []
`;

const PACKAGE_JSON = `{
  "name": "my-editframe-composition",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "preview": "editframe preview",
    "render": "editframe render -o dist/composition.mp4",
    "check": "editframe check"
  },
  "dependencies": {
    "@editframe/react": "^0.4.0",
    "@editframe/elements": "^0.4.0"
  },
  "devDependencies": {
    "@editframe/cli": "^0.4.0",
    "@editframe/vite-plugin": "^0.4.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "@vitejs/plugin-react": "^4.3.0"
  }
}
`;

const TSCONFIG_JSON = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src", "editframe.config.ts"]
}
`;

const VITE_CONFIG_TS = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { vitePluginEditframe as editframePlugin } from "@editframe/vite-plugin";
import path from "node:path";

const root = import.meta.dirname;
const cacheRoot = path.join(root, ".ef-cache");

export default defineConfig({
  plugins: [react(), editframePlugin({ root, cacheRoot })],
});
`;

export async function scaffoldEditframeProject(ctx: PluginHookContext): Promise<HookResult> {
  const projectPath = ctx.workpiecePath ?? ctx.workspaceRoot;
  const projectId = (ctx as PluginHookContext & { projectId?: string }).projectId ?? "my-editframe-composition";

  ctx.logger.info(`scaffold-project: creating Editframe composition at ${projectPath}`);

  try {
    await mkdir(join(projectPath, "src", "assets"), { recursive: true });
    await mkdir(join(projectPath, "public"), { recursive: true });

    await writeFile(join(projectPath, "src", "composition.tsx"), COMPOSITION_TSX);
    await writeFile(join(projectPath, "src", "assets", "manifest.yaml"), MANIFEST_YAML);
    await writeFile(join(projectPath, "editframe.config.ts"), EDITFRAME_CONFIG_TS);
    await writeFile(join(projectPath, "vite.config.ts"), VITE_CONFIG_TS);

    const pkgJson = PACKAGE_JSON.replace('"my-editframe-composition"', `"${projectId}"`);
    await writeFile(join(projectPath, "package.json"), pkgJson);

    await writeFile(join(projectPath, "tsconfig.json"), TSCONFIG_JSON);

    ctx.logger.info("scaffold-project: project created successfully");
    return {
      success: true,
      data: {
        projectPath,
        filesCreated: [
          "src/composition.tsx",
          "src/assets/manifest.yaml",
          "editframe.config.ts",
          "vite.config.ts",
          "package.json",
          "tsconfig.json",
        ],
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.logger.error("scaffold-project: failed", { error: message });
    return {
      success: false,
      errors: [`scaffoldProject failed: ${message}`],
    };
  }
}
