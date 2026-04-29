import type { SidebarsConfig } from "@docusaurus/plugin-content-docs";

/**
 * Sidebar IA mirrors ADR 0009 — document ids follow Docusaurus rules (leading
 * NNNN- prefixes in filenames are stripped from the URL id).
 */
const sidebars: SidebarsConfig = {
  docs: [
    {
      type: "category",
      label: "Getting started",
      items: [
        "project-overview",
        "quickstart",
        "recipes",
        "distribution/npm",
        "distribution/docker",
        "distribution/manual",
      ],
    },
    {
      type: "category",
      label: "User guide",
      items: [
        "user-guide/README",
        "user-guide/install",
        "user-guide/workspaces-and-agents",
        "user-guide/chats-and-messages",
        "user-guide/multiple-chats",
        "user-guide/feedback-and-export",
        "user-guide/going-further",
      ],
    },
    {
      type: "category",
      label: "Guides",
      items: ["cookbook", "providers", "exporting-feedback", "troubleshooting"],
    },
    {
      type: "category",
      label: "Architecture",
      items: ["ARCHITECTURE", "GLOSSARY"],
    },
    {
      type: "category",
      label: "Capabilities",
      items: [
        "specs/capabilities/workspaces",
        "specs/capabilities/agents",
        "specs/capabilities/chats-and-messages",
        "specs/capabilities/feedback-and-export",
        "specs/capabilities/media",
        "specs/capabilities/web-ui",
        "specs/capabilities/eval-harness",
      ],
    },
    {
      type: "category",
      label: "API contract",
      items: ["specs/api/README"],
    },
    {
      type: "category",
      label: "Architecture Decision Records",
      items: [
        "specs/adr/README",
        "specs/adr/record-architecture-decisions",
        "specs/adr/language-and-runtime",
        "specs/adr/distribution-channels",
        "specs/adr/http-framework",
        "specs/adr/web-ui-framework",
        "specs/adr/persistence-engines",
        "specs/adr/feedback-corpus-model",
        "specs/adr/mermaid-for-diagrams",
        "specs/adr/github-pages-documentation-site",
        "specs/adr/test-strategy",
        "specs/adr/hosted-instance-deferred",
        "specs/adr/security-and-dependency-scanning",
        "specs/adr/adopt-claude-design-system",
      ],
    },
    {
      type: "category",
      label: "Project",
      items: [
        "ROADMAP",
        "testing",
        "personas",
        "legal/data-handling",
        "specs/README",
        {
          type: "category",
          label: "Reviews",
          items: [
            "reviews/README",
            "reviews/2026-04-30-v1.0.0-ga",
            "reviews/2026-04-30-axe-contrast-check",
            "reviews/2026-04-30-uat-panel",
            "reviews/2026-04-30-v1.0.0-rc.1",
          ],
        },
      ],
    },
  ],
};

export default sidebars;
