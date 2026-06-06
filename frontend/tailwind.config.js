/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Mirror the design tokens so Tailwind utilities are available,
        // though fidelity comes from inline styles + tokens.css.
        navy: "#0F1A2E",
        teal: "#2A7F8E",
      },
      fontFamily: {
        display: ["DM Sans", "sans-serif"],
        body: ["Source Sans 3", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
