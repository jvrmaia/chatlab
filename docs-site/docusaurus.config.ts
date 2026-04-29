import type { Config } from "@docusaurus/types";
import type * as Preset from "@docusaurus/preset-classic";
import { themes as prismThemes } from "prism-react-renderer";

const config: Config = {
  title: "chatlab",
  tagline: "Local development platform for chat agents",
  url: "https://jvrmaia.github.io",
  baseUrl: "/chatlab/",
  organizationName: "jvrmaia",
  projectName: "chatlab",
  onBrokenLinks: "throw",
  markdown: {
    mermaid: true,
    // Parse docs as CommonMark, not MDX — repo prose uses `<http://...>` autolinks and `<Icon>`-style component names.
    format: "md",
  },
  themes: ["@docusaurus/theme-mermaid"],
  presets: [
    [
      "classic",
      {
        docs: {
          path: "../docs",
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
          exclude: [
            "**/specs/tests/**",
            "**/_design/**",
            "**/specs/capabilities/_template.md",
            "**/specs/adr/_template.md",
          ],
        },
        blog: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
    [
      "redocusaurus",
      {
        specs: [
          {
            id: "openapi",
            spec: "../docs/specs/api/openapi.yaml",
            route: "/api/",
          },
        ],
      },
    ],
  ],
  themeConfig: {
    navbar: {
      title: "chatlab",
      items: [
        {
          type: "docSidebar",
          sidebarId: "docs",
          position: "left",
          label: "Docs",
        },
        {
          to: "/api/",
          label: "API",
          position: "left",
        },
        {
          href: "https://github.com/jvrmaia/chatlab",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      copyright: `Copyright © ${new Date().getFullYear()} chatlab contributors.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
