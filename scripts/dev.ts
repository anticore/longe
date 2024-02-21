import watcher from "@parcel/watcher";
import path from "path";
import dotenv from "@dotenvx/dotenvx";
import { parseVault } from "./utils/parse";
import { fileURLToPath } from "url";

dotenv.config();

const __dirname = fileURLToPath(new URL("..", import.meta.url));

export const handleDev = async () => {
  //await parseVault();
  //await exportCables(config.patches);

  // dynamic import of vite to solve CJS deprecated warning
  // https://main.vitejs.dev/guide/migration#deprecate-cjs-node-api
  const { createServer } = await import("vite");

  const server = await createServer({
    configFile: false,
    root: __dirname,
    server: {
      port: 8080,
    },
  });
  await server.listen();

  server.bindCLIShortcuts({ print: false });

  // watch for wiki changes and reload the page
  await watcher.subscribe(path.join(__dirname, "content"), async () => {
    await parseVault();
    server.ws.send({ type: "full-reload" });
  });

  console.log(`\nRunning on http://localhost:8080\n`);
};
