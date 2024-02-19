import { useScript } from "@uidotdev/usehooks";
import { useMount } from "react-use";
import { useEffect } from "react";
import { patchUrls } from "../../utils/patchUrls";

import "./Avatar.scss";

// eslint-disable-next-line
declare const CABLES: any;

const avatarUrls = patchUrls("avatar");

function Avatar() {
  const patchStatus = useScript(avatarUrls.opsUrl);

  useMount(() => {
    document.getElementById("AvatarCanvas")?.addEventListener(
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
        patchFile: avatarUrls.patchFile,
        prefixAssetPath: avatarUrls.prefixAssetPath,
        assetPath: "",
        jsPath: "",
        glCanvasId: "AvatarCanvas",
        glCanvasResizeToWindow: true,
        onPatchLoaded: () => console.log("patch loaded"),
        onFinishedLoading: () => console.log("patch finished loading"),
        canvas: { alpha: true, premultipliedAlpha: true }, // make canvas transparent
      });
    }
  }, [patchStatus]);

  return (
    <div style={{ width: 300, height: 300 }}>
      <canvas
        id="AvatarCanvas"
        width="300px"
        height="300px"
        tabIndex={1}
      ></canvas>
    </div>
  );
}

export default Avatar;
