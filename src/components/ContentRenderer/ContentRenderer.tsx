import React from "react";
import parse from "html-react-parser";
import { useContentContext } from "../../contexts/contentContext";
import { useHash } from "react-use";

import "./ContentRenderer.scss";
import Avatar from "../Avatar/Avatar";

const ContentRenderer: React.FC = () => {
  const { content } = useContentContext();
  const [hash] = useHash();

  const cleanHash = hash.replace(/^#\//, "");
  const currentContent = content![cleanHash];

  return (
    <div className="content">
      {parse(currentContent.value, {
        // eslint-disable-next-line
        replace: ({ children, name }: any) =>
          name === "p" &&
          children[0].data === "{{component:Avatar}}" && <Avatar />,
      })}
    </div>
  );
};

export default ContentRenderer;
