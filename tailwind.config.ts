import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    // lib/ and hooks/ were missing, so the class names returned by
    // lib/utils.ts's avatarColor()/avatarGradient() ("bg-violet-500",
    // "from-violet-500 to-purple-600", …) were never generated — every sender
    // avatar rendered as a colourless circle.
    "./lib/**/*.{js,ts,jsx,tsx}",
    "./hooks/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#667eea",
        "primary-dark": "#764ba2",
      },
      backgroundImage: {
        "gradient-primary": "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
