import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.globalfsms.spos.shop",
  appName: "SPOS Shop",
  webDir: "www",
  server: {
    androidScheme: "https",
    cleartext: false,
    url: "https://shop.globalfsms.com"
  }
};

export default config;
