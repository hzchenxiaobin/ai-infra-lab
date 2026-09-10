#!/usr/bin/env node
import { tsImport } from "tsx/esm/api";
import { fileURLToPath } from "node:url";

const entry = fileURLToPath(new URL("../src/index.ts", import.meta.url));
process.argv[1] = entry;
await tsImport(entry, import.meta.url);
