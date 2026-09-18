/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        felt: {
          bg: "#14181C",
          panel: "#1B2027",
          green: "#1F3D2B",
          // L'accent du club. Il s'est appelé "gold" tant qu'il était doré ;
          // c'est désormais l'orange de BlindValet, relevé sur ses copies
          // d'écran. Le nom du jeton est gardé : le renommer toucherait 334
          // emplois sans rien changer à l'écran, et noierait les vrais
          // changements dans le bruit.
          gold: "#F77515",
          cream: "#EDEAE3",
          alert: "#8C3A3A",
        },
      },
      fontFamily: {
        display: ["'Oswald'", "sans-serif"],
        body: ["'Inter'", "sans-serif"],
      },
    },
  },
  plugins: [],
};
