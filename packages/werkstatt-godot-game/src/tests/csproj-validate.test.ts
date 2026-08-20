/*
<MODULE_CONTRACT>
<purpose>Unit tests for csproj-validate.ts (GODOT-06).</purpose>
<keywords>tests, csproj, validator, godot</keywords>
<non-goals>
  <item>Do not test external dependencies — only test validator logic.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial tests for csproj validator — passing, failing, and missing cases.</item>
  <item>Fix: update test message expectation for net8.0+ flexible check, add net9.0 passing test.</item>
  <item>Add Directory.Build.props property merging tests — verifies properties in Directory.Build.props are recognized by the validator.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { validateCsproj } from "../checks/csproj-validate.ts";
import { tmpdir } from "node:os";

describe("validateCsproj", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "tmp-csproj-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("passes when no Game.csproj exists", async () => {
    const result = await validateCsproj(tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
  });

  it("passes with valid Godot csproj", async () => {
    writeFileSync(
      join(tmpDir, "Game.csproj"),
      `<Project Sdk="Godot.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <EnableDynamicLoading>true</EnableDynamicLoading>
  </PropertyGroup>
</Project>`,
    );

    const result = await validateCsproj(tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
  });

  it("fails when Sdk is not Godot.NET.Sdk", async () => {
    writeFileSync(
      join(tmpDir, "Game.csproj"),
      `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <EnableDynamicLoading>true</EnableDynamicLoading>
  </PropertyGroup>
</Project>`,
    );

    const result = await validateCsproj(tmpDir);
    expect(result.exitCode).toBe(1);
    expect(result.data?.violations).toHaveLength(1);
    expect(result.data?.violations[0]?.ruleId).toBe("GODOT-06");
  });

  it("fails when TargetFramework is not net8.0", async () => {
    writeFileSync(
      join(tmpDir, "Game.csproj"),
      `<Project Sdk="Godot.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
    <EnableDynamicLoading>true</EnableDynamicLoading>
  </PropertyGroup>
</Project>`,
    );

    const result = await validateCsproj(tmpDir);
    expect(result.exitCode).toBe(1);
    expect(result.data?.violations).toHaveLength(1);
    expect(result.data?.violations[0]?.message).toContain("net8.0");
  });

  it("passes with net9.0 target", async () => {
    writeFileSync(
      join(tmpDir, "Game.csproj"),
      `<Project Sdk="Godot.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net9.0</TargetFramework>
    <EnableDynamicLoading>true</EnableDynamicLoading>
  </PropertyGroup>
</Project>`,
    );

    const result = await validateCsproj(tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
  });

  it("fails when EnableDynamicLoading is missing", async () => {
    writeFileSync(
      join(tmpDir, "Game.csproj"),
      `<Project Sdk="Godot.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
  </PropertyGroup>
</Project>`,
    );

    const result = await validateCsproj(tmpDir);
    expect(result.exitCode).toBe(1);
    expect(result.data?.violations).toHaveLength(1);
    expect(result.data?.violations[0]?.message).toContain("EnableDynamicLoading");
  });

  it("passes when properties are in Directory.Build.props instead of Game.csproj", async () => {
    writeFileSync(join(tmpDir, "Game.csproj"), `<Project Sdk="Godot.NET.Sdk" />`);
    writeFileSync(
      join(tmpDir, "Directory.Build.props"),
      `<Project>
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <EnableDynamicLoading>true</EnableDynamicLoading>
  </PropertyGroup>
</Project>`,
    );

    const result = await validateCsproj(tmpDir);
    expect(result.exitCode).toBe(0);
    expect(result.data?.status).toBe("pass");
  });

  it("fails when TargetFramework is only in Directory.Build.props but below net8.0", async () => {
    writeFileSync(join(tmpDir, "Game.csproj"), `<Project Sdk="Godot.NET.Sdk" />`);
    writeFileSync(
      join(tmpDir, "Directory.Build.props"),
      `<Project>
  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
    <EnableDynamicLoading>true</EnableDynamicLoading>
  </PropertyGroup>
</Project>`,
    );

    const result = await validateCsproj(tmpDir);
    expect(result.exitCode).toBe(1);
    expect(result.data?.violations).toHaveLength(1);
    expect(result.data?.violations[0]?.message).toContain("net8.0");
  });

  it("fails when EnableDynamicLoading is missing from both Game.csproj and Directory.Build.props", async () => {
    writeFileSync(join(tmpDir, "Game.csproj"), `<Project Sdk="Godot.NET.Sdk" />`);
    writeFileSync(
      join(tmpDir, "Directory.Build.props"),
      `<Project>
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
  </PropertyGroup>
</Project>`,
    );

    const result = await validateCsproj(tmpDir);
    expect(result.exitCode).toBe(1);
    expect(result.data?.violations).toHaveLength(1);
    expect(result.data?.violations[0]?.message).toContain("EnableDynamicLoading");
  });

  it("fails with all three violations", async () => {
    writeFileSync(
      join(tmpDir, "Game.csproj"),
      `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net6.0</TargetFramework>
  </PropertyGroup>
</Project>`,
    );

    const result = await validateCsproj(tmpDir);
    expect(result.exitCode).toBe(1);
    expect(result.data?.violations).toHaveLength(3);
  });
});
