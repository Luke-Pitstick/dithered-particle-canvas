import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageName = "@dithered-particle-canvas/react";
const workspacePackage = join(repoRoot, "packages/react");
const npmCache = join(tmpdir(), "dithered-particle-canvas-npm-cache");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    env: {
      ...process.env,
      npm_config_cache: npmCache,
      npm_config_update_notifier: "false"
    },
    encoding: "utf8",
    stdio: options.stdio ?? "pipe"
  });

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`${command} ${args.join(" ")} failed\n${output}`);
  }

  return result.stdout?.trim() ?? "";
}

async function assertPackageOutput() {
  const packageJson = JSON.parse(await readFile(join(workspacePackage, "package.json"), "utf8"));
  const expected = [packageJson.main, packageJson.types].map((path) => join(workspacePackage, path));

  for (const file of expected) {
    await readFile(file);
  }
}

async function linkDependency(consumerDir, dependency) {
  const source = join(repoRoot, "node_modules", ...dependency.split("/"));
  const target = join(consumerDir, "node_modules", ...dependency.split("/"));
  await mkdir(dirname(target), { recursive: true });
  await rm(target, { force: true, recursive: true });
  await symlink(source, target, "junction");
}

async function main() {
  await assertPackageOutput();

  const packDir = await mkdtemp(join(tmpdir(), "dpc-pack-"));
  const consumerDir = await mkdtemp(join(tmpdir(), "dpc-consumer-"));

  try {
    const packJson = run("npm", ["pack", "-w", packageName, "--json", "--pack-destination", packDir]);
    const [packResult] = JSON.parse(packJson);
    const tarball = join(packDir, packResult.filename);

    await writeFile(
      join(consumerDir, "package.json"),
      JSON.stringify(
        {
          private: true,
          type: "module",
          scripts: {
            build: "vite build"
          },
          dependencies: {
            [packageName]: `file:${tarball}`
          }
        },
        null,
        2
      )
    );

    run("npm", ["install", "--legacy-peer-deps", "--ignore-scripts", "--no-audit", "--no-fund"], {
      cwd: consumerDir
    });

    await linkDependency(consumerDir, "react");
    await linkDependency(consumerDir, "react-dom");
    await linkDependency(consumerDir, "vite");
    await linkDependency(consumerDir, "@vitejs/plugin-react");
    await linkDependency(consumerDir, "typescript");

    await mkdir(join(consumerDir, "src"), { recursive: true });
    await writeFile(
      join(consumerDir, "index.html"),
      '<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n'
    );
    await writeFile(
      join(consumerDir, "src/main.tsx"),
      `import React from "react";
import { createRoot } from "react-dom/client";
import { DitheredParticleCanvas, type DitheredParticleCanvasProps } from "@dithered-particle-canvas/react";

const props: DitheredParticleCanvasProps = {
  foreground: "/foreground.png",
  background: "/background.png",
  revealLayer: "background",
  fallback: "Package smoke test"
};

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DitheredParticleCanvas {...props} />
  </React.StrictMode>
);
`
    );

    const imported = run("node", ["--input-type=module", "-e", `import("${packageName}").then((mod) => console.log(Object.keys(mod).sort().join(",")))`], {
      cwd: consumerDir
    });

    if (!imported.includes("DitheredParticleCanvas") || !imported.includes("useDitheredCanvas")) {
      throw new Error(`Unexpected public exports from smoke consumer: ${imported}`);
    }

    run(join(repoRoot, "node_modules/.bin/vite"), ["build"], {
      cwd: consumerDir,
      stdio: "inherit"
    });

    console.log(`Smoke consumer installed ${packResult.filename} and built successfully.`);
  } finally {
    await rm(packDir, { force: true, recursive: true });
    await rm(consumerDir, { force: true, recursive: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
