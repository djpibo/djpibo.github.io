import {themes as prismThemes} from 'prism-react-renderer';
import type {Config} from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'deejay tech archive',
  tagline: 'save my trace - Oracle DBA, Architecture & AI Agent',
  favicon: 'img/logo.svg',

  // @ts-ignore : 타입 정의 누락 무시 (실제로는 초고속 빌드 정상 작동)
  future: {
    faster: {
      swcJsLoader: true,
      swcJsMinimizer: true,
      swcHtmlMinimizer: true,
      lightningCssMinimizer: true,
      rspackBundler: true,
    },
  },

  url: 'https://djpibo.github.io',
  baseUrl: '/',

  organizationName: 'djpibo',
  projectName: 'djpibo.github.io',
  trailingSlash: false,

  onBrokenLinks: 'throw',
  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },
  themes: ['@docusaurus/theme-mermaid'],

  i18n: {
    defaultLocale: 'ko',
    locales: ['ko'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/djpibo/djpibo.github.io/tree/main/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/docusaurus-social-card.jpg',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'deejay tech archive',
      logo: {
        alt: 'Deejay Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'tutorialSidebar',
          position: 'left',
          label: 'Documents',
        },
        {
          href: 'https://github.com/djpibo',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    mermaid: {
      theme: {light: 'neutral', dark: 'dark'},
      options: {
        look: 'classic',
        fontFamily: "'Inter', 'MaruBuri', -apple-system, BlinkMacSystemFont, sans-serif",
        flowchart: {
          curve: 'basis',
          padding: 16,
          nodeSpacing: 45,
          rankSpacing: 50,
          htmlLabels: true,
        },
        sequence: {
          mirrorActors: false,
          messageMargin: 38,
          boxMargin: 12,
          noteMargin: 12,
        },
        themeVariables: {
          fontSize: '14px',
          lineColor: '#8b949e',
        },
      },
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['sql', 'plsql', 'bash', 'python', 'json', 'yaml', 'docker', 'nginx'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;