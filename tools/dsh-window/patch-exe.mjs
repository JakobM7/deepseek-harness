#!/usr/bin/env node
/**
 * patch-exe.mjs — post-processes the SEA exe:
 *   1. embeds icon.ico (RT_GROUP_ICON + RT_ICON, PNG entries) with resedit
 *   2. sets version info (ProductName etc.)
 *   3. patches the PE subsystem from CONSOLE (3) to WINDOWS_GUI (2) so no
 *      console window appears when the exe is started by double-click
 *
 * The SEA blob (NODE_SEA_BLOB resource) is preserved: resedit reads and
 * rewrites the whole resource section, keeping unknown entries.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const exePath = process.argv[2] || join(here, 'dsh-window.exe');
const icoPath = process.argv[3] || join(here, 'icon.ico');

const require = createRequire(import.meta.url);
const { NtExecutable, NtExecutableResource, Resource, Data } = require(join(here, '.npminstall', 'node_modules', 'resedit', 'dist', 'index.js'));

const exeBin = readFileSync(exePath);
// The SEA exe has a (now-invalid) Authenticode certificate; ignore it.
const exe = NtExecutable.from(exeBin, { ignoreCert: true });
const res = NtExecutableResource.from(exe);

// --- icon -------------------------------------------------------------------
const iconFile = Data.IconFile.from(readFileSync(icoPath));
const icons = iconFile.icons.map((item) => {
  // PNG data -> RawIconItem (bitCount 32); resedit accepts PNG-based icons.
  const bin = item.data.bin || item.data.generate?.();
  return new Data.RawIconItem(bin, item.width ?? 0, item.height ?? 0, item.bitCount ?? 32);
});

// Remove existing icon groups, then add ours under group id 1 (lang 0).
res.removeResourceEntry(Resource.IconGroupEntry.type, 1);
res.removeResourceEntry(Resource.IconGroupEntry.type, 1, 0);
Resource.IconGroupEntry.replaceIconsForResource(res.entries, 1, 0, icons);

// --- version info -----------------------------------------------------------
const versionInfo = Resource.VersionInfo.create(0x409, {
  fileVersionMS: 0x00010000,
  fileVersionLS: 0,
  productVersionMS: 0x00010000,
  productVersionLS: 0,
}, [{
  lang: 0x409,
  codepage: 1200,
  values: {
    CompanyName: 'DeepSeek AI',
    FileDescription: 'DeepSeek Harness Window',
    FileVersion: '1.0.0',
    InternalName: 'dsh-window',
    LegalCopyright: 'MIT License',
    OriginalFilename: 'dsh-window.exe',
    ProductName: 'DeepSeek Harness Window',
    ProductVersion: '1.0.0',
  },
}]);
versionInfo.outputToResourceEntries(res.entries);

// --- write resources back ---------------------------------------------------
res.outputResource(exe);

// --- subsystem patch: CONSOLE(3) -> WINDOWS_GUI(2) ---------------------------
const out = Buffer.from(exe.generate());
const peOff = out.readUInt32LE(0x3c);
const optOff = peOff + 24; // PE signature(4) + COFF header(20)
const magic = out.readUInt16LE(optOff);
if (magic !== 0x20b && magic !== 0x10b) throw new Error(`unexpected optional header magic 0x${magic.toString(16)}`);
const subOff = optOff + 0x44; // Subsystem field offset in the optional header
const oldSub = out.readUInt16LE(subOff);
if (oldSub !== 3 && oldSub !== 2) throw new Error(`unexpected subsystem ${oldSub}`);
out.writeUInt16LE(2, subOff); // IMAGE_SUBSYSTEM_WINDOWS_GUI
console.log(`subsystem: ${oldSub === 3 ? 'CONSOLE' : 'GUI'} -> GUI`);

writeFileSync(exePath, out);
console.log(`patched ${exePath} (icon ${icons.length} sizes + version info + GUI subsystem)`);
