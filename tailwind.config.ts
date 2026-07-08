import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        shell: "#f4f7f4",
        ink: "#172036",
        accent: "#111827",
        accentSoft: "#fef3c7",
        mint: "#dcfce7",
        olive: "#047857",
        panel: "#ffffff",
        line: "#dbe3ea",
        cloud: "#eff6ff"
      },
      fontFamily: {
        sans: ["Aptos", "\"Segoe UI\"", "Tahoma", "sans-serif"],
        display: ["Bahnschrift", "Aptos", "\"Segoe UI\"", "sans-serif"]
      },
      boxShadow: {
        card: "0 18px 42px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
