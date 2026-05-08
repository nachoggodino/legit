// @ts-check
// `@type` JSDoc annotations allow editor autocompletion and type checking
// (when paired with `@ts-check`).

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "Copisaurus",
  tagline: "AI Research Wiki",
  favicon: "img/logo.png",

  url: "http://localhost:3000",
  baseUrl: "/",

  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "ignore",
    },
  },

  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },

  customFields: {
    backendUrl: process.env.BACKEND_URL || "http://localhost:8000",
    gitProvider: process.env.GIT_PROVIDER || "gitlab",
    gitRepoUrl: process.env.GIT_REPO_URL || "",
    gitDefaultBranch: process.env.GIT_DEFAULT_BRANCH || "master",
  },

  presets: [
    [
      "classic",
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          path: process.env.DOCS_PATH || "./docs",
          sidebarPath: "./sidebars.js",
          routeBasePath: "/",
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      navbar: {
        title: "Copisaurus",
        logo: {
          alt: "Copisaurus Logo",
          src: "img/logo.png",
        },
        items: [],
      },
      colorMode: {
        defaultMode: "light",
        disableSwitch: false,
        respectPrefersColorScheme: true,
      },
    }),

  plugins: [
    /**
     * Dev-server proxy: forwards /file, /chat, /edit, /commit, /health
     * to the FastAPI backend so relative URLs work during `docusaurus start`.
     * In production (Docker / nginx) the reverse-proxy handles routing instead.
     */
    function backendProxyPlugin() {
      return {
        name: "backend-proxy",
        configureWebpack() {
          return {
            devServer: {
              proxy: [
                {
                  context: ["/file", "/chat", "/edit", "/commit", "/health"],
                  target: process.env.BACKEND_URL || "http://localhost:8021",
                  changeOrigin: true,
                },
              ],
            },
          };
        },
      };
    },
  ],
};

module.exports = config;
