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

  const title = currentContent.data.matter.title;
  const updated = currentContent.data.matter.updated;

  return (
    <div className="content">
      {title && <h1>{title}</h1>}
      {updated && <small>Updated on: {updated}</small>}
      {parse(currentContent.value, {
        // eslint-disable-next-line
        replace: ({ children, name }: any) => {
          if (name === "p" && children[0].data === "{{component:Avatar}}") {
            return <Avatar />;
          }
        },
      })}
    </div>
  );
};

export default ContentRenderer;
