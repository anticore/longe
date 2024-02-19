import React from "react";

import "./NavLinks.scss";
import { useHash } from "react-use";

const NavLinks: React.FC = () => {
  const [hash] = useHash();

  return (
    hash !== "#/content/index.md" && (
      <div className="nav-links">
        <a href="#/content/index.md">go home</a>
      </div>
    )
  );
};

export default NavLinks;
