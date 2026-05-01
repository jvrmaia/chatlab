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
  // pt-BR is a partial translation (only public-facing docs); cross-doc `.md`
  // links inside the un-translated English docs cannot resolve cleanly inside
  // the pt-BR locale build. Demoted to `warn` until v1.2 catches up the spec /
  // ADR / cookbook docs. EN-only broken links still surface in the build log.
  onBrokenLinks: "warn",
  i18n: {
    defaultLocale: "en-US",
    locales: ["en-US", "pt-BR"],
    localeConfigs: {
      "en-US": { label: "English" },
      "pt-BR": { label: "Português" },
    },
  },
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
          type: "localeDropdown",
          position: "right",
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
