// @ts-check
// `@type` JSDoc annotations allow editor autocompletion and type checking
// (when paired with `@ts-check`).

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: "Copisaurus",
  tagline: "AI Research Wiki",
  favicon: "img/favicon.ico",

  url: "http://localhost:3000",
  baseUrl: "/",

  onBrokenLinks: "throw",
  onBrokenMarkdownLinks: "warn",

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
          src: "img/logo.svg",
        },
        items: [],
      },
      colorMode: {
        defaultMode: "light",
        disableSwitch: false,
        respectPrefersColorScheme: true,
      },
    }),
};

module.exports = config;
