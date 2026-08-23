import React, { ReactNode } from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import styles from './index.module.css';

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--dark', styles.heroBanner)} style={{ padding: '4.5rem 0 2rem 0', textAlign: 'center' }}>
      <div className="container">
        <Heading as="h1" className="hero__title" style={{ fontSize: '3rem', fontWeight: 800 }}>
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle" style={{ color: '#94a3b8', fontSize: '1.25rem', marginTop: '1rem' }}>
          Enterprise Oracle DBA, Distributed Architecture & AI Agent
        </p>
        <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <Link className="button button--primary button--lg" to="/docs/intro">
            Architecture Docs ➔
          </Link>
          <Link className="button button--secondary button--lg" to="/blog">
            RCA Incident Reports
          </Link>
        </div>
      </div>
    </header>
  );
}

// 2. 메인 페이지에 띄울 4가지 핵심 카테고리 데이터
const CategoryCards = [
  {
    title: '🗄️ DBMS Core Internals',
    desc: 'Oracle 19c & PostgreSQL 내부 아키텍처, AWR/ASH 리포트, Latch/Lock 경합 분석.',
    link: '/docs/category/oracle',
    badge: 'Core Engine',
  },
  {
    title: '🚨 CASE: 2026 1Q Reports',
    desc: '올영 세일 피크타임 장애 분석 보고서 및 영구 방지 대책(RCA).',
    link: '/docs/category/report',
    badge: 'Production RCA',
  },
  {
    title: '🤖 DBMS AI Agent',
    desc: 'AWS Bedrock API, Agentcore, Datadog Workflow 기반 Autonomous DBA 에이전트.',
    link: '/docs/intro',
    badge: 'Next-Gen DB',
  },
  {
    title: '⚡ DevOps & CI/CD Tuning',
    desc: 'GitHub Actions 파이프라인, Yarn v4 Zero-install, Rust 기반 빌드 환경(Rspack) 극한의 최적화.',
    link: '/blog/build-optimization',
    badge: 'Performance',
  },
];

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description="Oracle DBA & AI Architecture Archive">
      
      {/* 상단 타이틀 헤더 */}
      <HomepageHeader />
      
      <main style={{ padding: '1rem 1rem 4rem 1rem', maxWidth: '1100px', margin: '0 auto' }}>

        {/* 2x2 카테고리 네비게이션 카드 */}
        <div className="container" style={{ marginTop: '3rem' }}>
          <div className="row">
            {CategoryCards.map((card, idx) => (
              <div key={idx} className="col col--6" style={{ marginBottom: '1.5rem' }}>
                <div style={{
                  padding: '1.8rem',
                  borderRadius: '12px',
                  border: '1px solid #334155',
                  height: '100%',
                  background: '#1e293b',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}>
                  <div>
                    <span style={{
                      fontSize: '0.75rem',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      background: '#0f172a',
                      color: '#38bdf8',
                      border: '1px solid #1e40af',
                      fontWeight: 600
                    }}>
                      {card.badge}
                    </span>
                    <h3 style={{ fontSize: '1.2rem', margin: '1rem 0 0.5rem 0', color: '#f8fafc' }}>
                      {card.title}
                    </h3>
                    <p style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: '1.6' }}>
                      {card.desc}
                    </p>
                  </div>
                  <Link to={card.link} style={{ fontWeight: 600, color: '#38bdf8', marginTop: '1rem' }}>
                    바로가기 →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

      </main>
    </Layout>
  );
}