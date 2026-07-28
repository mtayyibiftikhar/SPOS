import assert from "node:assert/strict";
import test from "node:test";
import { getPosAssetDeliveryUrl, getPosAssetPath, normalizeBrandAssetUrls } from "../../src/lib/pos-asset-url";

const assetPath = "shops/2f7a/products/1720000000000-coffee.webp";

test("converts private storage paths into stable same-origin delivery URLs", () => {
  assert.equal(
    getPosAssetDeliveryUrl(assetPath),
    "/api/pos-assets/shops/2f7a/products/1720000000000-coffee.webp"
  );
});

test("converts legacy signed Supabase URLs into stable delivery URLs", () => {
  const signedUrl = `https://project.supabase.co/storage/v1/object/sign/pos-assets/${assetPath}?token=secret`;

  assert.equal(getPosAssetPath(signedUrl), assetPath);
  assert.equal(
    getPosAssetDeliveryUrl(signedUrl),
    "/api/pos-assets/shops/2f7a/products/1720000000000-coffee.webp"
  );
});

test("preserves external image URLs", () => {
  const externalUrl = "https://images.example.com/catalog/coffee.jpg";

  assert.equal(getPosAssetPath(externalUrl), null);
  assert.equal(getPosAssetDeliveryUrl(externalUrl), externalUrl);
});

test("normalizes every persisted branding image", () => {
  const brand = normalizeBrandAssetUrls({
    logoUrl: `https://project.supabase.co/storage/v1/object/sign/pos-assets/owner/branding/logo.webp?token=old`,
    loginAdImageUrl: "https://images.example.com/ad.jpg",
    loginHeroImages: ["owner/login-hero/hero.webp"]
  });

  assert.equal(brand.logoUrl, "/api/pos-assets/owner/branding/logo.webp");
  assert.equal(brand.loginAdImageUrl, "https://images.example.com/ad.jpg");
  assert.deepEqual(brand.loginHeroImages, ["/api/pos-assets/owner/login-hero/hero.webp"]);
});
