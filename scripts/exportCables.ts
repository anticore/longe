import cables from "@cables/cables";
import fs from "fs";

interface Patch {
  id: string;
  name: string;
  patchfile?: boolean;
}

const exportPatch = (patch: Patch) =>
  new Promise((resolve, reject) => {
    cables.export(
      {
        patchId: patch.id,
        destination: `public/patches/${patch.name}`,
        jsonFilename: patch.name,
        apiKey: process.env.CABLES_API_KEY,
        hideMadeWithCables: true,
        noSubdirs: false,
        combineJs: patch.patchfile,
      },
      resolve,
      reject
    );
  });

export interface ExportCablesOptions {
  patches: Patch[];
}

export const exportCables = async (patches: Patch[]) => {
  fs.rmSync("public/patches", { recursive: true, force: true });

  for (const patch of patches) {
    try {
      await exportPatch(patch);
    } catch (e) {
      console.error("error: ", e);
    }

    console.log("exported patch: " + patch.name);
  }
};
