/*
<MODULE_CONTRACT>
<purpose>godot.script.validate — checks C# script conventions for Godot 4.x + C# projects (GODOT-08).</purpose>
<keywords>validator, script, csharp, conventions, godot</keywords>
<responsibilities>
  <item>Validates that .cs files in Scripts/ follow Godot C# conventions.</item>
  <item>Checks: class name matches file name, partial keyword on Node subclasses, using Godot; present.</item>
</responsibilities>
<non-goals>
  <item>Does not compile C# code — use dotnet build for that.</item>
  <item>Does not validate .csproj settings — that is csproj-validate's job.</item>
  <item>Does not check for secrets — that is secret-scan's job.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial C# script conventions validator — GODOT-08.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { basename, relative } from "node:path";
import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";
import { listFilesRecursive } from "../utils/list-files-recursive.ts";

export interface ScriptValidateViolation {
  ruleId: string;
  file: string;
  message: string;
}

export interface ScriptValidateData {
  command: string;
  status: "pass" | "fail";
  violations: ScriptValidateViolation[];
}

const SKIP_DIRS = ["bin", "obj", ".godot", ".git", "node_modules"];
const GODOT_NODE_BASE_CLASSES = [
  "Node",
  "Node2D",
  "Node3D",
  "Control",
  "CanvasItem",
  "CharacterBody2D",
  "CharacterBody3D",
  "RigidBody2D",
  "RigidBody3D",
  "StaticBody2D",
  "StaticBody3D",
  "Area2D",
  "Area3D",
  "AnimationPlayer",
  "AnimationTree",
  "Camera2D",
  "Camera3D",
  "CollisionShape2D",
  "CollisionShape3D",
  "Sprite2D",
  "Sprite3D",
  "Label",
  "Button",
  "TextureRect",
  "ColorRect",
  "VBoxContainer",
  "HBoxContainer",
  "MarginContainer",
  "ScrollContainer",
  "Panel",
  "Window",
  "Resource",
  "RefCounted",
];

export async function validateScripts(
  projectRoot: string,
): Promise<KernelCommandResult<ScriptValidateData>> {
  const violations: ScriptValidateViolation[] = [];
  const csFiles = await listFilesRecursive(projectRoot, ".cs", SKIP_DIRS);

  for (const csFile of csFiles) {
    const relPath = relative(projectRoot, csFile);
    const fileName = basename(csFile, ".cs");
    const content = await readFile(csFile, "utf-8");

    // Check: using Godot; present
    if (!content.includes("using Godot;")) {
      violations.push({
        ruleId: "GODOT-08",
        file: relPath,
        message: 'C# script must include "using Godot;" for Godot API access',
      });
    }

    // Check: class name matches file name
    const classMatch = content.match(
      /(?:public|internal|file)?\s*(?:abstract\s+|sealed\s+|static\s+)?class\s+(\w+)/,
    );
    if (classMatch) {
      const className = classMatch[1]!;
      if (className !== fileName) {
        violations.push({
          ruleId: "GODOT-08",
          file: relPath,
          message: `Class name "${className}" does not match file name "${fileName}" — Godot requires exact match for script attachment`,
        });
      }

      // Check: partial keyword on Godot Node subclasses
      const classDeclMatch = content.match(
        /(?:public|internal|file)?\s*(?:abstract\s+|sealed\s+|static\s+)?(partial\s+)?class\s+\w+(?:\s*:\s*(\w+))?/,
      );
      if (classDeclMatch) {
        const isPartial = classDeclMatch[1] !== undefined;
        const baseClass = classDeclMatch[2];

        if (baseClass && GODOT_NODE_BASE_CLASSES.includes(baseClass)) {
          if (!isPartial) {
            violations.push({
              ruleId: "GODOT-08",
              file: relPath,
              message: `Class "${className}" inherits from Godot Node type "${baseClass}" but is not declared "partial" — Godot source generators require the partial keyword`,
            });
          }
        }
      }
    }
  }

  return {
    data: {
      command: "godot.script.validate",
      status: violations.length === 0 ? "pass" : "fail",
      violations,
    },
    exitCode: violations.length === 0 ? 0 : 1,
    summary: `godot.script.validate: ${violations.length === 0 ? "pass" : `${violations.length} violation(s)`}`,
  };
}

export function createScriptValidateCommand(): KernelCommandDefinition<ScriptValidateData> {
  return {
    name: "godot.script.validate",
    description: "Validate C# script conventions (class name, partial, using Godot)",
    scope: "workspace",
    cacheable: true,
    async execute(_input, context) {
      return validateScripts(context.workspaceRoot);
    },
  };
}
