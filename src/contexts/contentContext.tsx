import React, { createContext, useContext, useEffect, useState } from "react";
import { decode } from "@msgpack/msgpack";

interface Content {
  [filePath: string]: {
    cwd: string;
    data: {
      matter: {
        [matterKey: string]: string | number | boolean | null;
      };
    };
    history: string[];
    messages: string[];
    value: string;
  };
}

interface ContentContextValue {
  content: Content | null;
}

interface ContentProviderProps {
  children: React.ReactNode;
}

const ContentContext = createContext<ContentContextValue>({
  content: null,
});

export const ContentProvider: React.FC<ContentProviderProps> = ({
  children,
}) => {
  const [content, setContent] = useState<Content | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch("data.bson");
        const data = await decode(await response.arrayBuffer());
        // eslint-disable-next-line
        setContent(data as any);
      } catch (error) {
        console.error("Error loading JSON file:", error);
      }
    };

    fetchData();
  }, []);

  return (
    <ContentContext.Provider value={{ content }}>
      {content && content["content/index.md"] ? (
        children
      ) : (
        <div id="Loading" className="page">
          Loading...
        </div>
      )}
    </ContentContext.Provider>
  );
};

// eslint-disable-next-line
export const useContentContext = () => useContext(ContentContext);
