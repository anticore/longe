export function patchUrls(patch: string) {
  const patchUrl = `patches/${patch}`;
  const prefix = import.meta.env.BASE_URL || "";

  console.log({
    patchUrl,
    opsUrl: `${prefix}${patchUrl}/js/ops.js`,
    patchFile: `${prefix}${patchUrl}/js/${patch}.json`,
    prefixAssetPath: `${prefix}${patchUrl}/`,
  });

  return {
    patchUrl,
    opsUrl: `${prefix}${patchUrl}/js/ops.js`,
    patchFile: `${prefix}${patchUrl}/js/${patch}.json`,
    prefixAssetPath: `${prefix}${patchUrl}/`,
  };
}
