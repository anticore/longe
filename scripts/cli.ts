import yargs from "yargs";
import { handleDev } from "./dev";
import { handleBuild } from "./build";
import { exportCables } from "./exportCables";
import { handleSync } from "./sync";
import { config } from "../config";
//import { handleSync } from "./sync";

yargs
  .command("dev", "run in dev mode", () => {}, handleDev)
  .command("build", "build the project", () => {}, handleBuild)
  .command("export-cables", "export cables patches", () =>
    exportCables(config.patches)
  )
  .command("sync", "sync the project with GH", () => {}, handleSync)
  .demandCommand()
  .help().argv;
