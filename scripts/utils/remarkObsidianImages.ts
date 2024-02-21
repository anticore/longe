import { position } from "unist-util-position";
import { visitParents } from "unist-util-visit-parents";

export default function remarkObsidianImages() {
  const imageRegex = /^!\[\[([^\]]+)\]\]/;

  return function (tree) {
    visitParents(tree, "text", function (node, parents) {
      const value = node.value;

      if (imageRegex.test(value)) {
        const match = value.match(imageRegex);
        const parent = parents[parents.length - 1];
        const siblings = parent.children;
        siblings[siblings.indexOf(node)] = {
          type: "image",
          url: process.env.BASE_URL + `/assets/${match[1]}`,
          title: null,
          alt: "",
          position: position(node),
          children: [],
        };
      }
    });
  };
}
