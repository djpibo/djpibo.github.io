import React, { useState, ReactNode } from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import styles from './index.module.css';

interface ArticleItem {
  id: string;
  category: string;
  categorySlug: string;
  badge: string;
  title: string;
  desc: string;
  link: string;
  date: string;
  readTime: string;
  author: string;
  gradient: string;
  icon: string;
}

const FEATURED_PRIMARY: ArticleItem = {
  id: 'primary-oracle-buffer-cache',
  category: 'DBMS Core Internals',
  categorySlug: 'dbms',
  badge: 'Deep Dive',
  title: 'Oracle 19c Data Buffer Cache & LRU/Wait Event 완전 정복',
  desc: '대규모 트랜잭션 환경에서 발생하는 Buffer Cache 경합(CBC Latch, free buffer waits)의 원리를 파헤치고 실전 튜닝 메커니즘을 상세히 다룹니다.',
  link: '/docs/dbms/oracle/data-buffer-cache-lru-wait-event',
  date: '2026. 08. 20',
  readTime: '8 min read',
  author: 'deejay',
  gradient: 'linear-gradient(135deg, #1a73e8 0%, #0d47a1 100%)',
  icon: '🗄️',
};

const FEATURED_SECONDARY: ArticleItem[] = [
  {
    id: 'case-2026-1q',
    category: 'Production RCA',
    categorySlug: 'case',
    badge: 'Production RCA',
    title: '올영 세일 피크타임 가맹오늘드림배치 장애 분석 보고서',
    desc: '대규모 프로모션 트래픽 집중 시 발생한 배치 지연의 근본 원인 분석 및 영구 재발 방지 대책.',
    link: '/docs/case/2026-1Q/2026-1Q-incidents-reports',
    date: '2026. 08. 15',
    readTime: '6 min read',
    author: 'deejay',
    gradient: 'linear-gradient(135deg, #ea4335 0%, #b71c1c 100%)',
    icon: '🚨',
  },
  {
    id: 'blog-build-optimization',
    category: 'DevOps & Performance',
    categorySlug: 'devops',
    badge: 'Performance',
    title: 'Yarn v4 Zero-Install & Rspack으로 프론트엔드 빌드 5배 가속화',
    desc: 'GitHub Actions 환경에서 캐시 미스를 방지하고 초고속 Rust 기반 번들러를 도입한 실제 파이프라인 최적화 과정.',
    link: '/blog/build-optimization',
    date: '2026. 08. 10',
    readTime: '5 min read',
    author: 'deejay',
    gradient: 'linear-gradient(135deg, #34a853 0%, #1b5e20 100%)',
    icon: '⚡',
  },
];

const ARTICLES: ArticleItem[] = [
  {
    id: 'art-1',
    category: 'DBMS Core Internals',
    categorySlug: 'dbms',
    badge: 'Architecture',
    title: 'Oracle 19c & PostgreSQL 아키텍처 관점 비교 분석',
    desc: 'Process Structure, Shared Memory, WAL/Redo Logging 등 두 대표 엔터프라이즈 RDBMS의 내부 동작 차이를 정리합니다.',
    link: '/docs/dbms/oracle/oracle-architecture-overview',
    date: '2026. 08. 18',
    readTime: '5 min read',
    author: 'deejay',
    gradient: 'linear-gradient(135deg, #4285f4 0%, #1a73e8 100%)',
    icon: '🏛️',
  },
  {
    id: 'art-2',
    category: 'AI Agent & LLM',
    categorySlug: 'ai',
    badge: 'Next-Gen DB',
    title: 'Autonomous DBA: LLM에 대한 근본적인 질문과 에이전트 설계',
    desc: 'DBA 일상 업무를 자동화하는 LLM 기반 AI 에이전트 설계 시 고려해야 할 환각(Hallucination) 방지와 권한 분리 아키텍처.',
    link: '/docs/agent/llm-fundamental-questions',
    date: '2026. 08. 12',
    readTime: '7 min read',
    author: 'deejay',
    gradient: 'linear-gradient(135deg, #fbbc04 0%, #e37400 100%)',
    icon: '🤖',
  },
  {
    id: 'art-3',
    category: 'Production RCA',
    categorySlug: 'case',
    badge: 'RCA Report',
    title: '2026 1Q 대규모 피크 프로모션 트랜잭션 병목 개선 사례',
    desc: 'I/O 서브시스템 포화 및 동시성 락 경합 이슈를 해결하여 응답 속도를 70% 개선한 프로덕션 엔지니어링 사례.',
    link: '/docs/category/2026-1q',
    date: '2026. 08. 08',
    readTime: '6 min read',
    author: 'deejay',
    gradient: 'linear-gradient(135deg, #ea4335 0%, #c5221f 100%)',
    icon: '🔥',
  },
  {
    id: 'art-4',
    category: 'Monthly Logs',
    categorySlug: 'logs',
    badge: 'Monthly Log',
    title: '2026년 8월 엔지니어링 아카이브 & 월간 회의 준비 리포트',
    desc: '한 달간 진행된 핵심 데이터베이스 성능 점검 사항과 향후 개선 로드맵 공유 및 기술 회고.',
    link: '/blog/2026-08M',
    date: '2026. 08. 01',
    readTime: '4 min read',
    author: 'deejay',
    gradient: 'linear-gradient(135deg, #5f6368 0%, #3c4043 100%)',
    icon: '📝',
  },
  {
    id: 'art-5',
    category: 'DBMS Core Internals',
    categorySlug: 'dbms',
    badge: 'Performance',
    title: 'Oracle 19c LRU & Wait Event Deep Dive',
    desc: 'Buffer Cache 내의 Free Buffer 탐색 메커니즘과 Latch 경합 튜닝 가이드.',
    link: '/docs/category/oracle',
    date: '2026. 07. 28',
    readTime: '6 min read',
    author: 'deejay',
    gradient: 'linear-gradient(135deg, #00897b 0%, #004d40 100%)',
    icon: '🗄️',
  },
  {
    id: 'art-6',
    category: 'DevOps & Performance',
    categorySlug: 'devops',
    badge: 'CI/CD',
    title: 'CI/CD 빌드 파이프라인 극한의 병렬화 및 캐싱 전략',
    desc: 'GitHub Actions 러너의 CPU/RAM 자원을 극대화하고 의존성 캐시 최적화를 통해 빌드 배포 주기를 단축한 노하우.',
    link: '/blog/build-optimization',
    date: '2026. 07. 20',
    readTime: '5 min read',
    author: 'deejay',
    gradient: 'linear-gradient(135deg, #34a853 0%, #0f9d58 100%)',
    icon: '⚙️',
  },
];

const FILTER_TOPICS = [
  { label: 'All Stories', value: 'all' },
  { label: '🗄️ DBMS Core', value: 'dbms' },
  { label: '🚨 Production RCA', value: 'case' },
  { label: '🤖 AI Agent', value: 'ai' },
  { label: '⚡ DevOps & Perf', value: 'devops' },
  { label: '📝 Monthly Logs', value: 'logs' },
];

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  const [selectedTopic, setSelectedTopic] = useState<string>('all');

  const filteredArticles = selectedTopic === 'all'
    ? ARTICLES
    : ARTICLES.filter(art => art.categorySlug === selectedTopic);

  return (
    <Layout
      title="Engineering Traces & Tech Archive"
      description="Google Developers style blog for Oracle DBA, Architecture, and AI Agent insights">
      
      <main className={styles.mainContainer}>
        {/* Hero Intro */}
        <header className={styles.heroIntro}>
          <div className={styles.heroCategoryLabel}>
            <span className={styles.heroCategoryDot} />
            Deejay Engineering Blog & Docs
          </div>
          <h1 className={styles.heroTitle}>
            Engineering Traces & Architecture
          </h1>
          <p className={styles.heroSubtitle}>
            Oracle DBA, PostgreSQL 코어 인터널, 대규모 트래픽 장애 분석(RCA), 그리고 Autonomous AI 에이전트 시스템에 관한 기술적 통찰을 기록합니다.
          </p>
        </header>

        {/* Featured Section (Split Hero Card) */}
        <section className={styles.featuredSection}>
          {/* Main Hero Card */}
          <Link to={FEATURED_PRIMARY.link} className={styles.primaryFeaturedCard}>
            <div 
              className={styles.primaryBanner}
              style={{ background: FEATURED_PRIMARY.gradient }}>
              <span className={styles.bannerBadge}>⭐ Featured Story</span>
              <span style={{ fontSize: '4.5rem', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.3))' }}>
                {FEATURED_PRIMARY.icon}
              </span>
            </div>
            <div className={styles.primaryCardBody}>
              <div>
                <span className={styles.cardTag}>{FEATURED_PRIMARY.category}</span>
                <h2 className={styles.primaryCardTitle}>{FEATURED_PRIMARY.title}</h2>
                <p className={styles.primaryCardDesc}>{FEATURED_PRIMARY.desc}</p>
              </div>
              <div className={styles.metaRow}>
                <div className={styles.authorMeta}>
                  <div className={styles.authorAvatar}>DJ</div>
                  <span>{FEATURED_PRIMARY.author}</span>
                  <span>•</span>
                  <span>{FEATURED_PRIMARY.date}</span>
                </div>
                <div className={styles.readTime}>
                  <span>⏱️ {FEATURED_PRIMARY.readTime}</span>
                </div>
              </div>
            </div>
          </Link>

          {/* Secondary Highlights Column */}
          <div className={styles.secondaryColumn}>
            <div className={styles.secondaryHeader}>
              <span className={styles.secondaryHeaderTitle}>Editor's Picks</span>
              <Link to="/docs/intro" style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                View all docs →
              </Link>
            </div>

            {FEATURED_SECONDARY.map(item => (
              <Link key={item.id} to={item.link} className={styles.secondaryCard}>
                <div>
                  <div className={styles.secondaryTag}>{item.category}</div>
                  <h3 className={styles.secondaryTitle}>{item.title}</h3>
                  <p className={styles.secondaryDesc}>
                    {item.desc}
                  </p>
                </div>
                <div className={styles.metaRow} style={{ marginTop: '0.75rem', paddingTop: '0.6rem' }}>
                  <span style={{ fontSize: '0.75rem' }}>{item.date}</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ifm-color-primary)' }}>
                    Read Trace →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Interactive Topic Filter Chips */}
        <section className={styles.filterBarSection}>
          <div className={styles.filterHeading}>Explore by Topic</div>
          <div className={styles.chipContainer}>
            {FILTER_TOPICS.map(topic => {
              const isActive = selectedTopic === topic.value;
              return (
                <button
                  key={topic.value}
                  type="button"
                  onClick={() => setSelectedTopic(topic.value)}
                  className={`${styles.chip} ${isActive ? styles.chipActive : ''}`}>
                  {topic.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* 3-Column Articles Grid */}
        <section className={styles.gridSection}>
          <div className={styles.articleGrid}>
            {filteredArticles.map(article => (
              <Link key={article.id} to={article.link} className={styles.articleCard}>
                <div 
                  className={styles.cardThumbnail}
                  style={{ background: article.gradient }}>
                  <span style={{ fontSize: '2.8rem', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.25))' }}>
                    {article.icon}
                  </span>
                </div>
                <div className={styles.cardBody}>
                  <div>
                    <span className={styles.cardTag}>{article.category}</span>
                    <h3 className={styles.cardTitle}>{article.title}</h3>
                    <p className={styles.cardDesc}>{article.desc}</p>
                  </div>
                  <div className={styles.metaRow}>
                    <div className={styles.authorMeta}>
                      <div className={styles.authorAvatar}>DJ</div>
                      <span>{article.author}</span>
                      <span>•</span>
                      <span>{article.date}</span>
                    </div>
                    <div className={styles.readTime}>
                      <span>{article.readTime}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Newsletter & Engineering Archive Banner */}
        <section className={styles.newsletterBanner}>
          <h2 className={styles.newsletterTitle}>Stay Connected with Engineering Traces</h2>
          <p className={styles.newsletterDesc}>
            데이터베이스 코어 튜닝부터 자율형 AI 에이전트까지, 최신 기술 아카이브와 장애 분석 리포트를 확인해보세요.
          </p>
          <div className={styles.newsletterActions}>
            <Link to="/docs/intro" className={styles.primaryButton}>
              Explore Full Architecture Docs
            </Link>
            <Link to="https://github.com/djpibo" className={styles.secondaryButton}>
              GitHub Repository ↗
            </Link>
            <Link to="/blog" className={styles.secondaryButton}>
              All Blog Posts →
            </Link>
          </div>
        </section>
      </main>
    </Layout>
  );
}