---
id: postgres-wal-architecture
title: PostgreSQL WAL & MVCC Architecture
sidebar_label: WAL & MVCC
sidebar_position: 1
---

import AuthorHeader from '@site/src/components/AuthorHeader';

# PostgreSQL WAL & MVCC Architecture

<AuthorHeader date="2026년 8월 24일" readingTime="약 2분" />

PostgreSQL의 Write-Ahead Logging 메커니즘과 Multi-Version Concurrency Control 내부 동작을 정리합니다.