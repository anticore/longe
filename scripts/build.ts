import { config } from "../config";
import { exportCables } from "./exportCables";
import { parseVault } from "./utils/parse";
import { fileURLToPath } from "url";
import dotenv from "@dotenvx/dotenvx";

dotenv.config();

const __dirname = fileURLToPath(new URL("..", import.meta.url));

export const handleBuild = async () => {
  await parseVault();
  await exportCables(config.patches);

  // dynamic import of vite to solve CJS deprecated warning
  // https://main.vitejs.dev/guide/migration#deprecate-cjs-node-api
  const { build } = await import("vite");

  await build({
    root: __dirname,
    base: process.env.BASE_URL,
  });
};
