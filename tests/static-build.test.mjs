import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("genera la PWA para GitHub Pages", async () => {
  const [html, manifest, files] = await Promise.all([
    readFile(new URL("dist/index.html", root), "utf8"),
    readFile(new URL("dist/manifest.webmanifest", root), "utf8"),
    readdir(new URL("dist/assets/", root)),
  ]);

  assert.match(html, /Don Padrón \| Elaborados cárnicos/);
  assert.match(html, /\/donpadron\/assets\//);
  assert.doesNotMatch(html, /chatgpt\.site|openai/i);
  assert.ok(files.some((file) => file.endsWith(".js")));
  assert.equal(JSON.parse(manifest).start_url, "/donpadron/");
});

test("el código publicado no conserva direcciones del alojamiento anterior", async () => {
  const files = await readdir(new URL("dist/assets/", root));
  const contents = await Promise.all(
    files
      .filter((file) => file.endsWith(".js") || file.endsWith(".css"))
      .map((file) => readFile(new URL(`dist/assets/${file}`, root), "utf8")),
  );

  assert.doesNotMatch(contents.join("\n"), /chatgpt\.site|leetomy437|sites-vite-plugin/i);
});
