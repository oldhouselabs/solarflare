import fs from "node:fs";
import path from "node:path";

const packageJson = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")
);

// Get the list of external dependencies from package.json. These are not bundled.
const dependencies = Object.keys(packageJson.dependencies);
const internalDependencies = dependencies.filter(
  (dep) => !dep.startsWith("@repo/")
);
const peerDeendencies = Object.keys(packageJson.peerDependencies);
const externalDependencies = [...internalDependencies, ...peerDeendencies];

const publishPackageJson = () => {
  const modifiedPackageJson = {
    ...packageJson,
    dependencies: Object.fromEntries(
      externalDependencies.map((dep) => [dep, packageJson.dependencies[dep]])
    ),
  };
  delete modifiedPackageJson.devDependencies;

  // Place the modified package.json in the dist folder.

  // Ensure the publish folder exists.
  fs.mkdirSync("publish", { recursive: true });
  fs.writeFileSync(
    "publish/package.json",
    JSON.stringify(modifiedPackageJson, null, 2)
  );
  // Copy the README to the publish folder.
  fs.copyFileSync("README.md", "publish/README.md");
};

publishPackageJson();
