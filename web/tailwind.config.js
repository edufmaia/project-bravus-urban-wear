/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101014",
        shell: "#f7f4ef",
        lime: "#c6ff43",
        ember: "#ff6b3d",
        slate: "#22252b",
        steel: "#6b7280",
      },
      fontFamily: {
        display: ["Bebas Neue", "Oswald", "sans-serif"],
        body: ["Inter Tight", "Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 20px 50px rgba(16, 16, 20, 0.12)",
        ring: "0 0 0 1px rgba(16, 16, 20, 0.1)",
      },
    },
  },
  plugins: [],
};
