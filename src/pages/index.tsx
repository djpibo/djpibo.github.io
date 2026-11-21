import React, { useState, useMemo, ReactNode } from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import styles from './index.module.css';

type CategorySlug = 'database-engine' | 'production-tuning' | 'ai-agent' | 'ci-cd';

interface ArticleItem {
  id: string;
  category: string;
  categorySlug: CategorySlug;
  title: string;
  desc: string;
  link: string;
  date: string;      // YYYY. MM. DD
  monthKey: string;  // YYYY. MM
  readTime: string;
}

const FILTER_TOPICS: { label: string; value: 'all' | CategorySlug }[] = [
  { label: 'All', value: 'all' },
  { label: 'Database Engine', value: 'database-engine' },
  { label: 'Production Tuning', value: 'production-tuning' },
  { label: 'AI Agent', value: 'ai-agent' },
  { label: 'CI/CD', value: 'ci-cd' },
];

const ARTICLES: ArticleItem[] = [
  // 2026. 11
  {
    id: 'mapreduce-spark-distributed-db',
    category: 'Database Engine',
    categorySlug: 'database-engine',
    title: 'MapReduce vs Spark, 그리고 분산 분석 DB(Snowflake, ClickHouse) vs Document OLTP(MongoDB) 내부 메커니즘 비교',
    desc: 'JVM 실행 컨테이너, Off-Heap 메모리와 UnsafeRow, In-Memory Pipelining, Columnar Vectorized(SIMD) 관점에서 주요 데이터 엔진의 구조적 차이를 분석한다.',
    link: '/blog/mapreduce-spark-and-distributed-db-internals',
    date: '2026. 11. 14',
    monthKey: '2026. 11',
    readTime: '14 min',
  },

  // 2026. 09
  {
    id: 'query-optimizer-cardinality',
    category: 'Database Engine',
    categorySlug: 'database-engine',
    title: '쿼리 옵티마이저의 한계: 2편의 VLDB 논문 분석과 Subquery·WITH 절의 동작 원리',
    desc: '2015/2025 VLDB 논문 실측 데이터를 바탕으로 Cardinality 추정의 한계, Left-Deep vs Bushy Tree, Subquery Unnesting과 JPPD 메커니즘을 정리한다.',
    link: '/blog/query-optimizer-cardinality-and-subquery-internals',
    date: '2026. 09. 27',
    monthKey: '2026. 09',
    readTime: '11 min',
  },
  {
    id: 'jev-vs-traditional-llm',
    category: 'AI Agent',
    categorySlug: 'ai-agent',
    title: 'jev의 등장으로 살펴본 기존 LLM 방식의 구체적인 과정과 jev와의 차이점',
    desc: 'Transformer 1개 레이어 내부의 물리적 텐서 연산 과정과 기존 Reasoning LLM 대비 Jev가 추론 지연을 줄인 구조적 차이를 분석한다.',
    link: '/docs/agent/jev-vs-traditional-llm-mechanics',
    date: '2026. 09. 20',
    monthKey: '2026. 09',
    readTime: '15 min',
  },
  {
    id: 'rownum-barrier-predicate-pushdown',
    category: 'Database Engine',
    categorySlug: 'database-engine',
    title: 'SELECT절 ROWNUM 추가 시 Predicate Pushing이 차단되는 내부 메커니즘',
    desc: '단순 순번 표시를 위해 추가한 ROWNUM 하나가 JPPD를 무력화하고 인라인 뷰 전체를 Full Table Scan으로 전환시키는 원인을 추적한다.',
    link: '/docs/dbms/oracle/rownum-barrier-and-predicate-pushdown',
    date: '2026. 09. 19',
    monthKey: '2026. 09',
    readTime: '9 min',
  },
  {
    id: 'batch-spm-tuning',
    category: 'Production Tuning',
    categorySlug: 'production-tuning',
    title: '30분 주기 센터재고이동 배치의 실행 계획 왜곡 해결: Bind Peeking에서 SPM 긴급 처방까지',
    desc: '수주배분 배치 직후 발생한 실행 계획 왜곡 장애를 SQL Plan Management(SPM)로 고정하고 쿼리를 리팩토링한 프로덕션 튜닝 사례.',
    link: '/docs/dbms/oracle/batch-execution-plan-instability-spm-tuning',
    date: '2026. 09. 15',
    monthKey: '2026. 09',
    readTime: '12 min',
  },
  {
    id: 'oracle-rac-hikaricp-affinity',
    category: 'Database Engine',
    categorySlug: 'database-engine',
    title: 'Oracle RAC 환경의 HikariCP 노드 쏠림 진단: Connection Affinity와 maxLifetime 전략',
    desc: 'Oracle RAC LBA 환경에서 장기 유지 커넥션이 특정 노드에 고착되는 현상을 진단하고 maxLifetime 기반 분산 전략을 검증한다.',
    link: '/docs/dbms/oracle/oracle-rac-hikaricp-affinity-and-maxlifetime',
    date: '2026. 09. 14',
    monthKey: '2026. 09',
    readTime: '10 min',
  },
  {
    id: 'high-concurrency-insert-itl',
    category: 'Database Engine',
    categorySlug: 'database-engine',
    title: '대규모 트랜잭션 환경의 결제 INSERT 내부 동작: ITL 경합, Leaf Split, COMMIT 동기화 대응',
    desc: '초당 대량 결제 INSERT 시 발생하는 ITL Waits, Index Right-Hand Leaf Split, log file sync 병목의 내부 구조와 대응 방안을 다룬다.',
    link: '/docs/dbms/oracle/high-concurrency-insert-itl-and-index-split',
    date: '2026. 09. 13',
    monthKey: '2026. 09',
    readTime: '11 min',
  },
  {
    id: 'bulk-insert-batching-trace',
    category: 'Database Engine',
    categorySlug: 'database-engine',
    title: 'Java에서 실제로 Bulk Insert 처리를 하는지 Oracle DB에서 직접 트레이스하기',
    desc: 'JPA, MyBatis, JdbcTemplate의 배치 처리가 Oracle JDBC Thin Driver와 10046 Trace에서 실제 Array Processing으로 동작하는지 검증한다.',
    link: '/docs/dbms/oracle/bulk-insert-batching-and-oracle-verification',
    date: '2026. 09. 12',
    monthKey: '2026. 09',
    readTime: '12 min',
  },
  {
    id: 'multi-table-nl-vs-hash',
    category: 'Database Engine',
    categorySlug: 'database-engine',
    title: '5개 이상 테이블 조인에서 NL 조인이 Hash Join보다 유리한 경우',
    desc: '다중 테이블 조인 시 Hash Join의 PGA 빌드 비용과 Random Access 범위를 대조하여 NL Join이 유리해지는 조건을 분석한다.',
    link: '/docs/dbms/oracle/multi-table-nl-join-vs-hash-join',
    date: '2026. 09. 09',
    monthKey: '2026. 09',
    readTime: '6 min',
  },
  {
    id: 'oracle-sql-workload-event',
    category: 'Production Tuning',
    categorySlug: 'production-tuning',
    title: 'Oracle SQL 업무시간 부하 및 이벤트 분석',
    desc: '평시 대비 대규모 프로모션 이벤트 기간의 시간대별 SQL 호출량, CPU 시간, 수행시간 분포와 Top 10 SQL 부하를 정량 분석한다.',
    link: '/blog/oracle-sql-workload-event-analysis',
    date: '2026. 09. 06',
    monthKey: '2026. 09',
    readTime: '5 min',
  },
  {
    id: 'hourly-cpu-top-sql',
    category: 'Production Tuning',
    categorySlug: 'production-tuning',
    title: '시간대별 CPU 높은 SQL 찾기',
    desc: '대규모 분기 프로모션 기간 AWR 및 ASH Delta 통계를 기반으로 시간대별 CPU Top SQL을 선별하고 비즈니스 로직 병목을 개선한 사례.',
    link: '/docs/case/2026-1Q/oy-sale-stat-hourly-cpu-sql',
    date: '2026. 09. 05',
    monthKey: '2026. 09',
    readTime: '8 min',
  },
  {
    id: 'inefficient-sql-patterns',
    category: 'Production Tuning',
    categorySlug: 'production-tuning',
    title: '병목을 유발하는 SQL 비효율 패턴 4가지',
    desc: '대규모 트래픽 상황에서 CPU 급증과 응답 지연을 유발했던 4가지 대표 SQL 비효율 패턴과 개선 전후 지표를 정리한다.',
    link: '/docs/case/2026-1Q/oy-sale-insight-inefficient-patterns',
    date: '2026. 09. 05',
    monthKey: '2026. 09',
    readTime: '7 min',
  },
  {
    id: 'index-scan-vs-fts',
    category: 'Database Engine',
    categorySlug: 'database-engine',
    title: 'Index Scan vs Full Table Scan: I/O 메커니즘과 선택 기준 분석',
    desc: 'Single Block I/O와 Multi-Block I/O의 물리적 차이와 Clustering Factor에 따른 스캔 손익분기점을 분석한다.',
    link: '/docs/dbms/oracle/index-scan-vs-full-table-scan',
    date: '2026. 09. 05',
    monthKey: '2026. 09',
    readTime: '8 min',
  },
  {
    id: 'linguistic-vs-mathematical',
    category: 'Production Tuning',
    categorySlug: 'production-tuning',
    title: '언어적 천재와 수학적 천재',
    desc: '장애 분석과 시스템 개선 과정에서 마주하는 직관적 서사 접근과 정량적 지표 검증 접근의 차이를 회고한다.',
    link: '/docs/case/2026-1Q/oy-sale-linguistic-vs-mathematical-genius',
    date: '2026. 09. 05',
    monthKey: '2026. 09',
    readTime: '9 min',
  },

  // 2026. 08
  {
    id: 'data-buffer-cache-lru',
    category: 'Database Engine',
    categorySlug: 'database-engine',
    title: '배치 지연 현상의 원인을 분석하기 위해 오라클 내부 메모리 구조 분석',
    desc: '대규모 트랜잭션 환경에서 발생하는 Data Buffer Cache LRU 탐색과 CBC Latch, free buffer waits 경합 원리를 다룬다.',
    link: '/docs/dbms/oracle/data-buffer-cache-lru-wait-event',
    date: '2026. 08. 24',
    monthKey: '2026. 08',
    readTime: '6 min',
  },
  {
    id: 'view-merging-jppd',
    category: 'Database Engine',
    categorySlug: 'database-engine',
    title: '인라인 뷰를 처리하는 방법 두 가지: View Merging과 JPPD',
    desc: 'Oracle Optimizer가 Inline View를 처리하는 View Merging과 Join Predicate Push Down의 동작 원리와 제어 기준을 정리한다.',
    link: '/docs/dbms/oracle/view-push-predicate-down',
    date: '2026. 08. 24',
    monthKey: '2026. 08',
    readTime: '6 min',
  },
  {
    id: 'oracle-architecture-overview',
    category: 'Database Engine',
    categorySlug: 'database-engine',
    title: 'Oracle Database Architecture Overview',
    desc: 'Oracle 인스턴스의 SGA 메모리 구조, 백그라운드 프로세스, 그리고 물리 스토리지 아키텍처 핵심을 요약한다.',
    link: '/docs/dbms/oracle/oracle-architecture-overview',
    date: '2026. 08. 24',
    monthKey: '2026. 08',
    readTime: '3 min',
  },
  {
    id: 'postgres-wal-mvcc',
    category: 'Database Engine',
    categorySlug: 'database-engine',
    title: 'PostgreSQL WAL & MVCC Architecture',
    desc: 'PostgreSQL의 Write-Ahead Logging 메커니즘과 Multi-Version Concurrency Control 내부 동작을 정리한다.',
    link: '/docs/dbms/postgres/postgres-wal-architecture',
    date: '2026. 08. 24',
    monthKey: '2026. 08',
    readTime: '3 min',
  },
  {
    id: 'llm-fundamental-questions',
    category: 'AI Agent',
    categorySlug: 'ai-agent',
    title: 'LLM에 대한 근본적인 질문',
    desc: '인공신경망 기반 모델이 텍스트의 맥락을 파악하고 화자의 의도에 부합하는 답변을 생성하는 원리에 대한 엔지니어링 관점의 질문.',
    link: '/docs/agent/llm-fundamental-questions',
    date: '2026. 08. 24',
    monthKey: '2026. 08',
    readTime: '3 min',
  },
  {
    id: 'github-actions-build-opt',
    category: 'CI/CD',
    categorySlug: 'ci-cd',
    title: '[CI/CD] GitHub Actions 빌드 속도 70% 단축기: npm 한계 극복부터 Rust 번들러(Rspack) 도입까지',
    desc: 'Yarn v4 Zero-Install 캐싱과 Rspack 번들러 도입을 통해 정적 사이트 CI/CD 빌드 소요 시간을 단축한 과정을 정리한다.',
    link: '/blog/build-optimization',
    date: '2026. 08. 23',
    monthKey: '2026. 08',
    readTime: '5 min',
  },
];

export default function Home(): ReactNode {
  const [selectedTopic, setSelectedTopic] = useState<'all' | CategorySlug>('all');

  const topicCounts = useMemo(() => {
    const counts: Record<string, number> = { all: ARTICLES.length };
    for (const art of ARTICLES) {
      counts[art.categorySlug] = (counts[art.categorySlug] || 0) + 1;
    }
    return counts;
  }, []);

  const groupedByMonth = useMemo(() => {
    const filtered =
      selectedTopic === 'all'
        ? ARTICLES
        : ARTICLES.filter((art) => art.categorySlug === selectedTopic);

    const groups: { monthKey: string; items: ArticleItem[] }[] = [];
    for (const item of filtered) {
      const last = groups[groups.length - 1];
      if (last && last.monthKey === item.monthKey) {
        last.items.push(item);
      } else {
        groups.push({ monthKey: item.monthKey, items: [item] });
      }
    }
    return groups;
  }, [selectedTopic]);

  return (
    <Layout
      title="Engineering Traces"
      description="Database Engine, Production Tuning, AI Agent, CI/CD technical archive">
      <main className={styles.mainContainer}>
        {/* Minimal Page Header */}
        <header className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Recent Posts</h1>
          <p className={styles.pageSubtitle}>
            Database Engine, Production Tuning, AI Agent, CI/CD 관련 기술 분석과 운영 기록
          </p>
        </header>

        {/* Clean Category Filter Bar */}
        <nav className={styles.filterBar} aria-label="Category filter">
          {FILTER_TOPICS.map((topic) => {
            const isActive = selectedTopic === topic.value;
            return (
              <button
                key={topic.value}
                type="button"
                onClick={() => setSelectedTopic(topic.value)}
                className={`${styles.filterChip} ${isActive ? styles.filterChipActive : ''}`}>
                <span>{topic.label}</span>
                <span className={styles.filterCount}>{topicCounts[topic.value] || 0}</span>
              </button>
            );
          })}
        </nav>

        {/* Chronological Timeline with 2-Column Monthly Grid */}
        <section className={styles.timeline}>
          {groupedByMonth.map((group) => (
            <div key={group.monthKey} className={styles.monthGroup}>
              <div className={styles.timelineRail}>
                <span className={styles.timelineDot} aria-hidden="true" />
              </div>

              <div className={styles.monthContent}>
                <div className={styles.monthHeader}>
                  <h2 className={styles.monthTitle}>{group.monthKey}</h2>
                  <span className={styles.monthBadge}>{group.items.length} posts</span>
                </div>

                <div className={styles.postGrid}>
                  {group.items.map((article) => (
                    <Link
                      key={article.id}
                      to={article.link}
                      className={styles.postCard}>
                      <div className={styles.cardTopRow}>
                        <span className={styles.cardCategory}>{article.category}</span>
                        <span className={styles.cardDate}>{article.date}</span>
                      </div>

                      <h3 className={styles.cardTitle}>{article.title}</h3>
                      <p className={styles.cardDesc}>{article.desc}</p>

                      <div className={styles.cardFooter}>
                        <span className={styles.cardReadTime}>{article.readTime} read</span>
                        <span className={styles.cardArrow}>→</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </section>
      </main>
    </Layout>
  );
}
