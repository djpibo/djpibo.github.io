import React, { ReactNode } from 'react';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';

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
    link: '/blog/docusaurus-build-optimization',
    badge: 'Performance',
  },
];

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description="Oracle DBA & AI Architecture Archive">
      
      <main style={{ padding: '3.5rem 1rem 4rem 1rem', maxWidth: '1100px', margin: '0 auto' }}>
        <div className="container">
          <div className="row">
            {CategoryCards.map((card, idx) => (
              <div key={idx} className="col col--6" style={{ marginBottom: '1.8rem' }}>
                <div style={{
                  padding: '2rem',
                  borderRadius: '14px',
                  border: '1px solid #334155',
                  height: '100%',
                  background: '#1e293b',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
                }}>
                  <div>
                    <span style={{
                      fontSize: '0.75rem',
                      padding: '4px 9px',
                      borderRadius: '6px',
                      background: '#0f172a',
                      color: '#38bdf8',
                      border: '1px solid #1e40af',
                      fontWeight: 600
                    }}>
                      {card.badge}
                    </span>
                    <h3 style={{ fontSize: '1.25rem', margin: '1.2rem 0 0.6rem 0', color: '#f8fafc' }}>
                      {card.title}
                    </h3>
                    <p style={{ color: '#94a3b8', fontSize: '0.92rem', lineHeight: '1.6' }}>
                      {card.desc}
                    </p>
                  </div>
                  <Link 
                    to={card.link} 
                    style={{ 
                      fontWeight: 600, 
                      color: '#38bdf8', 
                      marginTop: '1.2rem',
                      display: 'inline-flex',
                      alignItems: 'center'
                    }}>
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