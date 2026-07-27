/*
<MODULE_CONTRACT>
<purpose>Facilitates the correction of import paths in icon component files following migration.</purpose>
<non-goals>
  <item>Do not handle non-icon component files or other file types.</item>
  <item>Do not perform any content validation or transformation beyond import path adjustments.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Tidied by compass.changesummary.tidy; see git history for prior entries.</item>
</CHANGE_SUMMARY>
*/

/**
 * Script to fix import paths in migrated icon components
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = path.join(__dirname, "..", "src", "icons", "lordicon");

function fixImportsInFile(filePath) {
  let content = fs.readFileSync(filePath, "utf8");
  let modified = false;

  // Fix 1: LordIconBase import path
  // From: import LordIconBase from "../../../../lord-icon-base.astro";
  // To:   import LordIconBase from "../../lord-icon-base.astro";
  if (content.includes('import LordIconBase from "../../../../lord-icon-base.astro"')) {
    content = content.replace(
      /import LordIconBase from "\.\.\/\.\.\/\.\.\/\.\.\/lord-icon-base\.astro";/g,
      'import LordIconBase from "../../lord-icon-base.astro";',
    );
    modified = true;
  }

  // Fix 2: Props type import
  // From: type Props = Omit<import("../../../../lord-icon-base.astro").Props, "src">;
  // To:   type Props = Omit<import("../../lord-icon-base.astro").Props, "src">;
  if (content.includes('import("../../../../lord-icon-base.astro").Props')) {
    content = content.replace(
      /type Props = Omit<import\("\.\.\/\.\.\/\.\.\/\.\.\/lord-icon-base\.astro"\)\.Props, "src">;/g,
      'type Props = Omit<import("../../lord-icon-base.astro").Props, "src">;',
    );
    modified = true;
  }

  // Fix 3: JSON asset import
  // From: import src from "@assets/icons/lordicon/...
  // To:   import src from "../../../../assets/icons/lordicon/...
  if (content.includes('import src from "@assets/icons/lordicon/')) {
    content = content.replace(
      /import src from "@assets\/icons\/lordicon\//g,
      'import src from "../../../../assets/icons/lordicon/',
    );
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(filePath, content, "utf8");
    console.log(`✓ Fixed: ${path.relative(process.cwd(), filePath)}`);
    return true;
  }
  return false;
}

function walkDir(dir) {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += walkDir(fullPath);
    } else if (entry.name.endsWith(".astro")) {
      if (fixImportsInFile(fullPath)) {
        count++;
      }
    }
  }
  return count;
}

console.log("Fixing import paths in icon components...\n");
const fixed = walkDir(ICONS_DIR);
console.log(`\n✅ Fixed ${fixed} files`);
