---
id: view-push-predicate-down
title: "인라인 뷰를 처리하는 방법 두 가지: View Merging과 JPPD"
sidebar_label: 인라인 뷰 처리 동작 방식
sidebar_position: 3
date: "2026년 8월 24일"
reading_time: "약 6분"
---

FROM 절 안에 위치한 서브쿼리를 Inline View라고 한다.  
일반적인 조인 조건을 직접 걸지 않고 Inline View 형태로 감싸는 주된 목적은 대상 데이터의 모수를 사전에 축소하기 위함이다.  
집계 용도로 활용할 경우 WITH 절보다는 Inline View를 선호하는 편인데, 1회성 참조 시 불필요한 임시 메모리 점유나 디스크 쓰기를 방지할 수 있기 때문이다.

Oracle 옵티마이저가 Inline View를 처리하는 물리적 방식은 크게 **View Merging(뷰 병합)**과 **JPPD(Join Predicate Push Down, 조건절 밀어넣기)** 두 가지로 나뉜다.

---

## 1. 첫 번째 방식: View Merging (뷰 병합)

View Merging은 Inline View의 테이블 형식으로 풀어서 메인 Query Block으로 평탄화(Flattening)하는 최적화 방식이다.

```sql
-- 원본 SQL: Inline View 형태
SELECT D.dname, V.empno, V.ename
FROM DEPT D,
     (SELECT empno, ename, deptno 
      FROM EMP 
      WHERE sal >= 3000) V
WHERE D.deptno = V.deptno;

-- View Merging 적용 후 옵티마이저 내부 변환 형태
SELECT D.dname, E.empno, E.ename
FROM DEPT D, EMP E
WHERE D.deptno = E.deptno
  AND E.sal >= 3000;
```

### 동작 원리와 특징
- Inline View 내부의 테이블(`EMP`)이 부모 Query Block으로 올라와 메인 테이블(`DEPT`)과 대등한 레벨에 위치한다.
- **장점**: 옵티마이저가 두 테이블의 조인 순서(DEPT -> EMP 또는 EMP -> DEPT)와 조인 방식(Hash Join, NL Join)을 제약 없이 자유롭게 탐색할 수 있다.
- **제어 힌트**:
  - `/*+ MERGE(v) */`: 뷰 병합 강제
  - `/*+ NO_MERGE(v) */`: 뷰 병합 차단 (독립된 뷰 상태 유지)

---

## 2. 두 번째 방식: JPPD (Join Predicate Push Down)

Inline View 내부에 `GROUP BY`나 `DISTINCT`가 포함되어 있으면 원천적으로 단순 View Merging이 불가능하다. 데이터를 먼저 집계해야 집합의 정합성이 유지되기 때문이다.

이때 인라인 뷰 내부의 대량 데이터를 모두 집계하는 부하를 막기 위해 옵티마이저는 **메인 테이블의 조인 조건을 Inline View 내부의 WHERE 절에 합치는 기법**이 JPPD다.

```sql
-- 원본 SQL: 부서별 급여 집계 Inline View
SELECT D.dname, V.total_sal
FROM DEPT D,
     (SELECT deptno, SUM(sal) AS total_sal
      FROM EMP
      GROUP BY deptno) V
WHERE D.deptno = V.deptno
  AND D.loc = 'SEOUL';

-- JPPD 변환 후 실행 구조
SELECT D.dname, V.total_sal
FROM DEPT D,
     (SELECT deptno, SUM(sal) AS total_sal
      FROM EMP
      WHERE deptno = D.deptno -- <-- 조인 조건만 뷰 내부에 추가됨
      GROUP BY deptno) V
WHERE D.loc = 'SEOUL';
```

### 동작 원리와 특징
- 메인 테이블에서 `loc = 'SEOUL'`인 부서 1건이 먼저 읽히면, 그 `deptno` 값이 Inline View 내부로 파라미터처럼 전달된다.
- Inline View는 전체 1,000만 건을 전수 집계하는 대신, 전달받은 `deptno`에 대해서만 인덱스를 타고 부분 집계를 수행한다.
- 실행 계획 상에서는 `VIEW PUSHED PREDICATE` 오퍼레이션으로 표기된다.
- **제어 힌트**:
  - `/*+ PUSH_PRED(v) */`: 조인 조건 밀어넣기 강제
  - `/*+ NO_PUSH_PRED(v) */`: 조건 밀어넣기 차단 (뷰를 1회만 독립 집계 후 Hash Join 유도)

---

## 3. 두 방식의 선택 기준과 주의점

| 구분 | View Merging | JPPD (View Pushed Predicate) |
| :--- | :--- | :--- |
| **적용 조건** | 단순 1:1, 1:N 조인 (GROUP BY 없음) | 뷰 내부에 GROUP BY, DISTINCT 등 집계 연산 존재 |
| **핵심 이점** | 조인 순서 탐색 공간 극대화 | 메인 조건에 해당하는 키만 인덱스 부분 집계 |
| **위험 요인** | 조건 간 상관관계 미고려 시 잘못된 조인 순서 선택 | 메인 건수가 많을 때 뷰가 반복 호출되는 Loop 부하 |

### 실무 엔지니어링 주의사항
- **메인 테이블의 건수가 소수(1~10건)일 때**: JPPD가 적용되어 Nested-Loop 방식으로 뷰 내부 인덱스를 찌르는 것이 가장 빠르다.
- **메인 테이블의 건수가 대량(수만 건 이상)일 때**: JPPD가 적용되면 뷰가 수만 번 반복 실행되는 심각한 성능 저하가 발생한다. 이때는 `/*+ NO_PUSH_PRED(v) */` 힌트를 통해 뷰를 단 1회만 집계하여 메모리에 올린 뒤 `Hash Join`으로 결합하도록 유도해야 한다.
