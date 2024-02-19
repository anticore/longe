import React, { useEffect } from "react";
import { useContentContext } from "../../contexts/contentContext";
import ContentRenderer from "../ContentRenderer/ContentRenderer";
import { useHash } from "react-use";
import Background from "../Background/Background";
import NavLinks from "../NavLinks/NavLinks";

import "./Layout.scss";

const Layout: React.FC = () => {
  const { content } = useContentContext();
  const [hash, setHash] = useHash();

  // If the content has loaded and the hash is empty,
  // set the hash to the index file.
  useEffect(() => {
    if (content && content["content/index.md"] && hash === "") {
      setHash("/content/index.md");
    }
    // eslint-disable-next-line
  }, [hash]);

  return (
    <div className="layout">
      <Background />
      <NavLinks />
      {hash && <ContentRenderer />}
    </div>
  );
};

export default Layout;
