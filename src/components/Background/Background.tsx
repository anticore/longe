import { useScript } from "@uidotdev/usehooks";
import { useMount } from "react-use";
import { useEffect } from "react";
import { patchUrls } from "../../utils/patchUrls";

import "./Background.scss";

// eslint-disable-next-line
declare const CABLES: any;

const backgroundUrls = patchUrls("background");

function Background() {
  const patchStatus = useScript(backgroundUrls.opsUrl);

  useMount(() => {
    document.getElementById("BackgroundCanvas")?.addEventListener(
      "touchmove",
      (e) => {
        e.preventDefault();
      },
      false
    );
  });

  useEffect(() => {
    if (patchStatus === "ready") {
      CABLES.patch = new CABLES.Patch({
        patchFile: backgroundUrls.patchFile,
        prefixAssetPath: backgroundUrls.prefixAssetPath,
        assetPath: "",
        jsPath: "",
        glCanvasId: "BackgroundCanvas",
        glCanvasResizeToWindow: true,
        onPatchLoaded: () => console.log("patch loaded"),
        onFinishedLoading: () => console.log("patch finished loading"),
        canvas: { alpha: true, premultipliedAlpha: true }, // make canvas transparent
      });
    }
  }, [patchStatus]);

  return (
    <div>
      <canvas
        id="BackgroundCanvas"
        width="100vw"
        height="100vh"
        tabIndex={1}
      ></canvas>
    </div>
  );
}

export default Background;
