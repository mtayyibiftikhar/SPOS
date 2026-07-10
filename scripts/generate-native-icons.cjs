const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
const pngToIco = require("png-to-ico").default;

const root = path.resolve(__dirname, "..");
const sourceSvg = path.join(root, "apps", "native-assets", "app-icon.svg");
const nativeAssetsDir = path.join(root, "apps", "native-assets");
const androidResDir = path.join(root, "apps", "mobile", "android", "app", "src", "main", "res");

async function renderPng(size) {
  return sharp(sourceSvg)
    .resize(size, size)
    .png()
    .toBuffer();
}

async function writeFile(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data);
}

async function generateSharedAssets() {
  const png1024 = await renderPng(1024);
  await writeFile(path.join(nativeAssetsDir, "app-icon.png"), png1024);

  const icoPngs = await Promise.all([16, 24, 32, 48, 64, 128, 256].map(renderPng));
  const ico = await pngToIco(icoPngs);
  await writeFile(path.join(nativeAssetsDir, "app-icon.ico"), ico);
}

async function generateAndroidIcons() {
  try {
    await fs.access(androidResDir);
  } catch {
    return;
  }

  const densitySizes = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192
  };

  await Promise.all(
    Object.entries(densitySizes).flatMap(([folder, size]) => {
      const targetDir = path.join(androidResDir, folder);

      return [
        renderPng(size).then((png) => writeFile(path.join(targetDir, "ic_launcher.png"), png)),
        renderPng(size).then((png) => writeFile(path.join(targetDir, "ic_launcher_round.png"), png)),
        renderPng(size).then((png) => writeFile(path.join(targetDir, "ic_launcher_foreground.png"), png))
      ];
    })
  );
}

async function main() {
  await generateSharedAssets();
  await generateAndroidIcons();
  console.log("Generated native icons from apps/native-assets/app-icon.svg");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
