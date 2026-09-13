---
id: data-buffer-cache-lru-wait-event
title: "배치 지연 현상의 원인을 분석하기 위해 오라클 내부 메모리 구조 분석"
sidebar_label: Data Buffer Cache & LRU Wait Event
sidebar_position: 2
date: "2026년 8월 24일"
reading_time: "약 6분"
---

# Oracle Data Buffer Cache 내부 구조와 LRU Wait Event 분석

## 1. 배치 지연 현상과 실행 계획의 한계

신규로 수정한 배치가 기존 대비 2배 이상 지연되는 현상이 발생했다. 어느 구간에서 지연이 발생하는지 확인하기 위해 실행 중인 실행 계획을 살펴보았다.

하지만 Execution Plan만으로는 실행 중인 SQL이 어느 지점에서 멈춰 있는지, 지연의 정확한 물리적 원인이 무엇인지 밝혀내기 어렵다. 기껏해야 대용량 테이블에서 Full Table Scan이 발생하는지 확인하는 수준에 그친다.

사후에 쿼리와 바인드 변수를 전달받아 실행 계획상 가장 많은 Cost를 소모하는 구간을 확인하고 튜닝하는 방식이 일반적이다.

---

## 2. Wait Event를 통한 병목 원인 확인

모니터링 도구를 활용하면 실행 중인 쿼리의 Wait Event를 파악할 수 있다. 대부분 CPU 사용률이 95~99%를 차지하지만, 간혹 메모리 래치 관련 이벤트가 관측될 때가 있다.

이번에 확인된 지표는 LRU Cache 관련 대기였다. 개발팀과 확인했을 때 의심 구간이었던 Nested Loop Join과 연관이 깊을 것으로 판단하여 LRU Cache 동작 구조를 분석했다.

---

## 3. Oracle Data Buffer Cache의 내부 메모리 구조

Oracle은 인스턴스 메모리 영역으로 SGA(System Global Area)를 가진다. 메타데이터와 캐시 데이터를 공유 관리하는 공간이다.

그중 Data Buffer Cache는 데이터 블록의 일부를 메모리상에 캐싱하여 디스크 I/O를 줄이고 조회 성능을 높이는 영역이다.

Wait Event의 물리적 원인을 파악하려면 버퍼 캐시의 상세 구조와 교체 알고리즘을 이해해야 한다.

### 3.1. 버퍼와 메타데이터 관리

Data Buffer Cache의 메모리 단위를 Buffer라고 부른다. 디스크 파일의 데이터 블록을 메모리 버퍼로 복사한 후 조회나 수정을 수행한다.  
버퍼의 상태와 위치 정보는 Buffer Header에 저장되며, 버퍼는 LRU List로 관리된다.

UPDATE 쿼리가 실행되어 데이터 블록이 변경되면 변경 사항은 Redo Log Buffer에 기록된다. Commit이 발생하면 Redo Log Buffer의 내용을 Online Redo Log에 기록한다. 이후 DBWR(Database Writer)가 더티 블록을 데이터 파일에 반영한다.

### 3.2. 버퍼의 세 가지 상태

버퍼 상태는 크게 세 가지로 나뉜다:
- **Unused**: 한 번도 사용되지 않았고 현재도 비어 있는 버퍼.
- **Clean**: 이전에 사용되었으나 현재는 MVCC에 의해 읽기 일관성이 보장된 상태. 동기화가 완료되어 재사용 가능하다.
- **Dirty**: 디스크에 기록되지 않은 변경 데이터가 남아 있는 상태. 블록을 재사용하기 전에 DBWR가 디스크에 기록(체크포인트)해야 한다.

---

## 4. LRU 알고리즘 동작 메커니즘

Oracle 8부터 적용된 터치 카운트 기반 LRU(Touch Count-based LRU)는 Hot/Cold 영역 분리 방식을 사용한다.

```text
 +-----------------------------------------------------------------------------------------+
 |                                  Data Buffer Cache                                      |
 +-----------------------------------------------------------------------------------------+
                          |                                          |
                          v                                          v
              [ Replacement List (LRU) ]                 [ Write List (LRUW) ]
             (메모리 공간 확보 / 탐색용)                   (DBWR 디스크 기록 대기)
                          |
           +--------------+--------------+
           |                             |
           v                             v
    [ Hot 영역 ]                   [ Cold 영역 ]
 (자주 참조되는 블록)             (방출 대상 후보군)

 +------------------+------------------+ +-----------------------+------------------------+
 |     Hot Head     |     Hot Tail     | |    Cold Head (Mid)    |       Cold Tail        |
 +------------------+------------------+ +-----------------------+------------------------+
          ^                                          |                      |
          | (Promoted when TCH >= 2)                 | (TCH <= 1)           |
          +------------------------------------------+                      v
                                                                   [Free Buffer Victim]
```

LRU와 LRUW List를 합쳐 Working Set이라 부른다. Working Set이 **메모리 공간의 수명 관리**를 담당한다면, Hash Chain은 **빠른 위치 탐색**을 담당한다.  
쿼리가 블록을 검색할 때는 LRU List를 처음부터 순회하지 않고, 블록 주소(DBA)를 해싱하여 Hash Chain을 통해 Buffer Header에 즉시 접근한다.

### 4.1. SQL 유형별 동작 흐름

1. **조회 쿼리 (SELECT - Consistent 모드)**:
   - **위치 탐색**: 블록 주소를 해싱하여 Hash Chain에서 Buffer Header를 탐색한다.
   - **공간 확보**: 캐시에 블록이 없다면 LRU List의 Cold End에서 Free Buffer를 확보해 디스크 데이터를 적재한다.
   - **CR 복제**: 대상 블록이 Dirty 상태라면 Undo를 참조하여 과거 시점의 CR 복제본을 LRU List에 생성한다.

2. **수정 쿼리 (UPDATE - Current 모드)**:
   - **최신 탐색**: Hash Chain을 통해 가장 최신 원본 Buffer Header를 찾는다.
   - **데이터 변경**: Pin을 획득한 후 데이터를 수정하여 버퍼를 Dirty 상태로 전환한다.
   - **쓰기 대기**: 수정이 완료된 Buffer Header는 디스크 기록을 위해 Working Set의 LRUW List로 등록된다.

### 4.2. Touch Count와 영역 이동

캐싱된 블록에 접근하면 Buffer Header의 Touch Count가 1 증가한다.  
단, 특정 쿼리의 반복 접근으로 인한 왜곡을 방지하기 위해 `_db_aging_touch_time` 파라미터(기본 3초) 간격으로 카운트를 갱신한다.

Touch Count가 올랐다고 해서 즉시 Hot 영역으로 이동하지는 않는다. LRU List 포인터를 재배치하는 비용이 높기 때문이다. 신규 Free Buffer가 필요해 LRU List를 스캔하는 시점에 재배치가 이루어진다. 이때 적절한 Free Buffer를 찾지 못하면 `free buffer waits` 이벤트가 발생한다.

디스크에서 처음 로드된 버퍼는 Cold Tail에 배치된다. 이후 Touch Count가 2 이상 누적되고 스캔 대상이 되면 Hot 영역으로 승격되며, 이때 Touch Count는 0으로 초기화된다.

---

## 5. 메모리 래치 경합과 Wait Event 분석

### 5.1. `write complete waits`
LRU List에서 버퍼를 방출할 때 대상 버퍼가 Dirty 상태라면 DBWR의 디스크 기록이 끝날 때까지 대기해야 한다. 이때 발생하는 대기 이벤트가 `write complete waits`다.

### 5.2. `latch: cache buffers lru chain`
다음과 같은 이유로 LRU List의 구조를 변경하거나 스캔할 때 LRU 래치를 획득해야 한다:
- Free Buffer 할당을 위한 LRU List 스캔
- Hot/Cold 영역 간 Buffer Header 이동
- Dirty 버퍼의 LRUW 등록 및 DBWR 기록 후 반환

대량 데이터 처리 시 메모리 할당 요청이 몰리면 이 래치에 대한 경합이 급증한다.

### 5.3. `latch: cache buffers chains` (CBC Latch)

Hash Chain은 블록 주소를 Hash Bucket 배열에 매핑한 링크드 리스트 구조다.

```text
[ Hash Function ] : Inputs a Data Block Address (DBA) and returns a bucket number between 0 and N.

[ Hash Bucket Array ]       [ Hash Chain (Doubly Linked List of Buffer Headers) ]
                                 (Entry 1)              (Entry 2)
┌─────────────┐             ┌─────────────────┐    ┌─────────────────┐
│ Bucket #0   │ ── Pointer ─▶│ Buffer Header A  ◀▶ │ Buffer Header F 
├─────────────┤             └─────────────────┘    └─────────────────┘
│ Bucket #1   │ ── (Empty - No data hashed to this bucket yet)
├─────────────┤             ┌─────────────────┐
│ Bucket #2   │ ── Pointer ─▶│ Buffer Header B 
├─────────────┤             └─────────────────┘
│ ...         │ 
├─────────────┤             ┌─────────────────┐    ┌─────────────────┐
│ Bucket #100 │ ── Pointer ─▶│ Buffer Header C  ◀▶ │ Buffer Header D 
└─────────────┘             └─────────────────┘    └─────────────────┘
```

버킷에 Buffer Header를 등록하거나 스캔할 때 Hash Chain을 보호하기 위해 래치를 획득해야 한다.  
Oracle은 버킷마다 개별 래치를 두지 않고, 1개의 래치가 여러 버킷(1:N)을 관리하도록 설계되어 있다.

여러 세션이 동일 래치가 관장하는 버킷 내 Hot Block에 동시 접근하면 `latch: cache buffers chains` 경합이 발생한다.

래치 개수는 `_db_block_hash_latches` 파라미터로 관리되며 CPU 코어 수에 비례한다. 시스템 스케일업으로 래치 수를 늘릴 수는 있으나, 특정 단일 블록으로 트래픽이 집중되는 현상은 파라미터 조정만으로 해소하기 어렵다.

---

## 6. 병목 해결을 위한 아키텍처적 접근

1. **근본 해결: Buffer Gets 최소화**:
   디스크와 캐시 메모리를 거치는 블록 수 자체를 줄이는 것이 최우선이다. 비효율적인 Index Scan이나 반복적인 Table Random Access를 제거해야 한다.

2. **Direct Path I/O 활용**:
   대량 데이터 배치 작업에서는 Buffer Cache를 경유하지 않고 PGA로 직접 읽어 들이는 Direct Path Read(Full Table Scan)를 활용하면 버퍼 래치 경합을 원천 회피할 수 있다.

3. **Join 기법 전환 (NL Join $\rightarrow$ Hash Join)**:
   Nested Loop Join은 Inner 테이블을 반복 탐색하며 매번 CBC Latch 경합을 유발한다. 반면 Hash Join은 선행 테이블로 해시 테이블을 빌드한 뒤 PGA 세션 메모리에서 Probe 작업을 수행하므로 SGA 래치 쏠림을 크게 줄일 수 있다.