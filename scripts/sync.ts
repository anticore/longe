import ghPages from "gh-pages";

export const handleSync = () => {
  ghPages.publish("dist", function (err) {
    console.error(err);
  });
};
