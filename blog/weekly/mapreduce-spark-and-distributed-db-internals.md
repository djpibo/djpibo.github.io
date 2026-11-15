---
slug: mapreduce-spark-and-distributed-db-internals
title: "MapReduce와 Spark, 그리고 분산 분석 DB(Snowflake·ClickHouse)의 내부 메커니즘 비교"
date: 2026-11-14
authors: [deejay]
tags: [architecture, optimization]
---

MapReduce와 Spark의 차이를 흔히 Disk 기반과 Memory 기반의 차이로만 요약하곤 한다. 하지만 실제 대용량 배치를 운영해 보면, 두 엔진의 처리 성능 차이는 단순한 저장 매체의 속도 차이보다 JVM 프로세스 생명주기 관리, Memory Layout(On-Heap 대 Off-Heap), 그리고 데이터 파이프라인(DAG) 실행 방식의 구조적 차이에서 발생한다.

본 글에서는 JVM 실행 컨테이너와 In-Memory Pipelining 관점에서 MapReduce와 Spark의 내부 동작 원리를 대조하고, 나아가 Snowflake나 ClickHouse 같은 분산 분석 DB(MPP/OLAP)가 어떤 지점에서 Spark와 아키텍처적 지향점을 달리하는지 정리한다.

<!--truncate-->

---

## 1. JVM 및 메모리 관리 메커니즘 비교

두 엔진은 워커 노드에서 Task를 띄우고 메모리를 다루는 물리적 방식부터 다르다.

```mermaid
flowchart LR
    classDef storage fill:#E8F5E9,stroke:#4CAF50,color:#1B5E20;
    classDef process fill:#FFF9C4,stroke:#FBC02D,color:#5D4037;
    classDef cloud fill:#E1F5FE,stroke:#0288D1,color:#01579B;

    subgraph MR ["MapReduce: 1회용 JVM 생성 및 종료 모델"]
        direction LR
        NM1(["NodeManager"]):::cloud
        JVM1["JVM Process 1<br/>Task 1 실행 후 즉시 종료"]:::process
        JVM2["JVM Process 2<br/>Task 2 실행 후 즉시 종료"]:::process
        HEAP1[("On-Heap Memory<br/>Java 객체 생성")]:::storage
        NM1 -->|"OS 프로세스 Fork (수 초)"| JVM1
        NM1 -->|"OS 프로세스 Fork (수 초)"| JVM2
        JVM1 -->|"100MB 버퍼 채운 후 종료"| HEAP1
    end

    subgraph SP ["Spark: Executor JVM 유지 및 Thread 재사용 모델"]
        direction LR
        DRV(["Spark Driver"]):::cloud
        EXEC["Executor JVM (종료 안 됨)<br/>내부 Thread Pool 재사용"]:::process
        TUNG[("Off-Heap Memory<br/>UnsafeRow Binary")]:::storage
        DRV -->|"LaunchTask RPC (수 ms)"| EXEC
        EXEC -->|"sun.misc.Unsafe 포인터 연산"| TUNG
    end
```
<p align="center"><em>Figure 1: MapReduce의 1회용 Task JVM 모델과 Spark의 재사용형 Executor JVM 모델 비교</em></p>

### 1.1 Task 실행 모델: 1회용 JVM 프로세스 대 Executor Thread Pool

#### (1) MapReduce: Task 1개마다 JVM을 새로 띄우고 끄는 1회용 프로세스 방식
MapReduce는 하나의 Map Task나 Reduce Task를 실행할 때마다 YARN의 `NodeManager`가 별도의 JVM 프로세스를 새로 띄운다(Fork). 그리고 그 Task 1개의 처리가 끝나면 해당 JVM 프로세스를 즉시 종료시킨다.
- **장점 (장애 격리와 GC 무관심)**: 특정 Task에서 `OutOfMemoryError`가 발생해도 다른 Task와 프로세스가 분리되어 있어 영향이 없다. 또한 Task 하나만 처리하고 몇 초나 몇 분 만에 JVM 프로세스 자체가 곧바로 종료되므로, 메모리에 쌓인 쓰레기 객체를 굳이 Garbage Collection(GC)으로 청소할 필요 없이 OS가 프로세스 종료와 함께 메모리 전체를 한 번에 회수해 간다.
- **단점 (반복되는 기동 비용)**: 수만 개의 짧은 Task로 구성된 Job을 실행할 때, 매번 무거운 JVM 프로세스를 OS 레벨에서 새로 띄우고 수백 개의 `.class` 파일을 디스크에서 로딩(Class Loading)하는 데만 매 Task마다 수 초씩 고정 시간이 소모된다.

#### (2) Spark: 한 번 띄워 두고 끝날 때까지 재사용하는 Executor JVM 방식
Spark는 배치 작업(Application)이 시작될 때 각 워커 노드에 `Executor`라는 JVM 프로세스를 미리 띄워 두고, 전체 작업이 완전히 끝날 때까지 이 JVM을 끄지 않고 계속 유지한다(웹 서버의 WAS나 DB의 백그라운드 프로세스를 계속 띄워 두는 것과 같다).

Driver가 새로운 Task를 할당할 때는 무거운 JVM 프로세스를 새로 띄우는 대신, 이미 떠 있는 Executor 내부의 Thread Pool에서 놀고 있는 Thread 하나에 작업만 넘겨주어 즉시 실행한다. 이때 두 가지 핵심 메커니즘이 작동한다.

- **`LaunchTask RPC`를 통한 초고속 작업 전달**:
  MapReduce가 Task를 실행하려고 OS에 새 프로세스 생성을 요청(`fork & exec`, 수 초 소요)하는 것과 달리, Spark Driver는 이미 Executor와 연결된 네트워크 소켓(Netty 기반 RPC, Remote Procedure Call)을 통해 "몇 번 데이터 블록을 읽어서 이 함수를 실행하라"는 수 킬로바이트(KB)짜리 작업 명세서 패킷(`LaunchTask` 메시지) 하나만 전송한다. Executor는 이 네트워크 메시지만 받아서 빈 Thread에 바로 태우므로 Task 시작 지연 시간이 수 밀리초(ms) 단위로 줄어든다.
- **JIT(Just-In-Time) Compiler의 기계어 최적화 누적**:
  JVM은 처음에 기동되면 `.class` 바이트코드를 **Interpreter**가 한 줄씩 읽어서 기계어로 통역하며 실행하기 때문에 초기 속도가 느리다. 그러다 특정 루프나 함수가 수천 번 이상 반복 실행(Hotspot 감지)되면, JVM 내부의 **JIT Compiler(C1/C2)**가 개입하여 해당 바이트코드 구간 전체를 CPU가 통역 없이 바로 실행할 수 있는 **순수 기계어(Native Machine Code)**로 통째로 번역해 메모리의 Code Cache에 저장한다(이 과정에서 함수 호출을 합치는 Inlining 등 코드 최적화도 함께 수행된다).
  - **MapReduce의 한계**: 데이터를 읽으며 이제 막 JIT Compiler가 기계어 번역을 마쳐 속도가 빨라질 만하면 Task가 끝나서 JVM 프로세스가 꺼져 버린다. 다음 Task가 뜨면 새 JVM에서 또 느린 Interpreter부터 다시 시작해야 한다.
  - **Spark의 이점**: Executor JVM이 꺼지지 않고 계속 살아 있으므로, 초반 몇 개 Task를 처리할 때 한 번 JIT 컴파일된 고속 기계어 코드가 메모리에 그대로 유지된다. 덕분에 이후 실행되는 수만 개의 후속 Task는 워밍업 과정 없이 처음부터 컴파일된 기계어 속도로 실행된다.

---

### 1.2 메모리 관리: On-Heap 객체 의존 대 Project Tungsten (Off-Heap)

Spark처럼 JVM을 끄지 않고 계속 띄워 두는 방식을 쓰면 필연적으로 **Java 객체의 메모리 낭비와 GC Stop-the-World** 문제를 마주하게 된다.

Java에서 4바이트 문자열(`"abcd"`) 하나를 `java.lang.String` 객체로 JVM Heap에 올리면, 객체 헤더(Mark Word, Klass Word 12-16B), `char` 배열 참조, 해시코드 캐시, 8바이트 정렬 패딩이 붙어 실제 메모리는 약 48바이트 이상을 점유한다. 수억 건의 레코드를 JVM On-Heap 객체로 적재하면 실제 데이터 크기 대비 2-5배의 메모리가 소모되고, Old Generation 영역이 차오르면서 수십 초 이상 모든 작업이 멈추는 Full GC가 발생한다.

이 문제를 해결하기 위해 Spark는 `Project Tungsten`을 통해 데이터를 JVM On-Heap 객체가 아닌 **Off-Heap(OS Native Memory)의 연속된 바이트 배열**에 직접 배치하는 구조를 도입했다.

```mermaid
flowchart LR
    classDef storage fill:#E8F5E9,stroke:#4CAF50,color:#1B5E20;
    classDef process fill:#FFF9C4,stroke:#FBC02D,color:#5D4037;
    classDef cloud fill:#E1F5FE,stroke:#0288D1,color:#01579B;

    subgraph ON_HEAP ["1. 일반 JVM On-Heap: 객체 파편화 및 Pointer Chasing"]
        direction LR
        ROW_OBJ["Row 객체 헤더 (16B)<br/>주소: 0x1000"]:::process
        STR_OBJ["String 객체 헤더 (24B)<br/>주소: 0x5A00 (멀리 떨어짐)"]:::process
        CHAR_ARR["byte[] 실제 문자열<br/>주소: 0x9F00 (또 점프)"]:::storage
        ROW_OBJ -->|"포인터 참조 (Cache Miss)"| STR_OBJ
        STR_OBJ -->|"포인터 참조 (Cache Miss)"| CHAR_ARR
    end

    subgraph OFF_HEAP ["2. Spark Off-Heap: 연속된 메모리 배치 및 L1/L2 Cache 적중"]
        direction LR
        CONT_MEM[("OS Native Memory (GC 대상 제외)<br/>주소 0x2000부터 연속 배치:<br/>[1001 | 50000 | 'APPLE']")]:::storage
        CPU_CACHE["CPU L1/L2 Cache (64B Cache Line)<br/>한 번 읽을 때 인접 데이터 통째로 적재"]:::cloud
        CONT_MEM -->|"포인터 점프 없이 순차 로드"| CPU_CACHE
    end
```
<p align="center"><em>Figure 2: JVM On-Heap의 객체 파편화 구조와 Spark Off-Heap의 연속 메모리 배치 및 CPU 캐시 효율 비교</em></p>

#### 왜 Off-Heap이 유리하며 CPU L1/L2 Cache Locality가 높아지는가?
1. **GC 오버헤드 완전 제거**:
   On-Heap은 JVM의 Garbage Collector가 수억 개 객체의 참조 그래프를 일일이 추적하며 청소해야 한다. 반면 Off-Heap은 JVM Heap 바깥의 OS 메모리 영역(`malloc`과 유사한 `Unsafe.allocateMemory`)에Spark가 직접 큰 메모리 페이지를 할당받아 쓰는 공간이다. GC는 이 영역을 아예 쳐다보지 않으므로 데이터가 수십 GB 쌓여도 GC 멈춤 현상이 발생하지 않는다.
2. **Pointer Chasing 제거와 CPU L1/L2 Cache Locality(공간 지역성) 극대화**:
   CPU가 연산을 수행할 때 메인 메모리(RAM)까지 직접 가서 데이터를 가져오면 약 60-100 나노초(ns)가 걸리지만, CPU 코어 내부의 **L1 Cache**에서 가져오면 약 1 나노초(ns)밖에 걸리지 않는다.
   이 때문에 CPU는 RAM에서 데이터를 읽을 때 요청받은 몇 바이트만 가져오지 않고, **그 주소 주변의 연속된 64바이트(Cache Line)를 한 덩어리로 묶어 L1/L2 Cache에 미리 올려둔다(Spatial Locality 활용).**
   - **On-Heap의 문제**: 위 `Figure 2`의 상단처럼 `Row` 객체(`0x1000`), `String` 객체(`0x5A00`), 실제 문자열 바이트 배열(`0x9F00`)이 메모리 여기저기에 흩어져 생성된다. CPU가 `Row`를 읽으면서 주변 64바이트를 L1 Cache에 올려봤자, 정작 필요한 문자열은 전혀 다른 주소(`0x9F00`)에 있으므로 L1 Cache에 없는 상태(**Cache Miss**)가 되어 매번 느린 RAM까지 다시 다녀와야 한다(Pointer Chasing).
   - **Off-Heap(`UnsafeRow`)의 이점**: 한 행의 모든 컬럼 값과 문자열 바이트가 `0x2000`번지부터 빈틈없이 일렬로 붙어 있다. CPU가 행의 시작 주소만 읽어도 64바이트 Cache Line 안에 `id`, `price`, `name` 데이터까지 한꺼번에 딸려 들어와 L1/L2 Cache에 적재된다. 즉, 다음 컬럼을 읽을 때 RAM에 갈 필요 없이 **L1 Cache에서 1ns 만에 즉시 꺼내 쓸 수 있어(Cache Hit)** CPU 연산 속도가 크게 향상된다.

#### 1.2.1 `UnsafeRow`의 3단 구조와 `sun.misc.Unsafe` 접근 원리

Spark가 Off-Heap(또는 연속된 바이트 배열)에 한 행을 저장할 때 사용하는 바이너리 포맷이 `UnsafeRow`다. 구조는 아래 그림처럼 단순한 3단 구획으로 나뉜다.

```mermaid
flowchart LR
    classDef storage fill:#E8F5E9,stroke:#4CAF50,color:#1B5E20;
    classDef process fill:#FFF9C4,stroke:#FBC02D,color:#5D4037;
    classDef cloud fill:#E1F5FE,stroke:#0288D1,color:#01579B;

    NULL_BIT["[1] Null Bitmap (8B)<br/>+0B: 컬럼별 Null 표시"]:::cloud
    SLOTS["[2] 고정 8B Slot 영역 (컬럼당 8B 고정)<br/>+8B: id = 1001<br/>+16B: name = (위치 +32B, 길이 5)<br/>+24B: price = 50000"]:::process
    VAR_DATA[("[3] 가변 데이터 영역<br/>+32B: 'APPLE' (실제 문자열)")]:::storage

    NULL_BIT --> SLOTS --> VAR_DATA
```
<p align="center"><em>Figure 3: (id=1001, name='APPLE', price=50000) 레코드를 연속 바이트로 배치한 UnsafeRow 3단 구조</em></p>

1. **[1] Null Bitmap 영역 (`+0B`, 8 Bytes)**: 각 컬럼이 `NULL`인지 여부를 1비트씩 기록한다.
2. **[2] 고정 8B Slot 영역 (`컬럼 수 * 8 Bytes`)**: 데이터 타입과 무관하게 **모든 컬럼에 무조건 8바이트 고정 칸**을 배정한다. 숫자(`id`, `price`)는 그 칸에 값을 바로 적고, 길이가 변하는 문자열(`name`)은 `[실제 글자가 적힌 뒤쪽 상대 위치(+32B) | 글자 길이(5)]` 정보만 8바이트 숫자로 압축해서 적는다.
3. **[3] 가변 데이터 영역 (`+32B` 이후)**: 고정 칸들이 끝난 바로 뒷자리부터 `'APPLE'` 같은 실제 문자열 바이트를 이어서 기록한다.

앞쪽 `[2]번 영역`의 모든 컬럼 칸 크기를 **정확히 8바이트로 통일**해 두었기 때문에, 몇 번째 컬럼이든 앞선 컬럼들을 파싱(Deserialization)할 필요 없이 `시작주소 + 8B + (컬럼순번 * 8B)`라는 단순 덧셈·곱셈만으로 정확한 메모리 위치를 `O(1)`에 찾아낼 수 있다.

```java
// Spark UnsafeRow가 Java 객체 생성 없이 2번째 컬럼(price)을 바로 읽어내는 코드
public long getLong(int ordinal) {
    // 1. 산술 연산만으로 price 컬럼의 정확한 메모리 주소(+24B) 계산
    final long offset = baseOffset + bitSetWidthInBytes + (ordinal * 8L);
    
    // 2. sun.misc.Unsafe를 통해 C언어 포인터처럼 해당 메모리 주소에서 8바이트를 즉시 읽음
    return Platform.getLong(baseObject, offset);
}
```

---

## 2. In-Memory Pipelining과 Shuffle 메커니즘 비교

페타바이트 규모의 데이터를 처리할 때 모든 중간 데이터를 메모리에 올려두는 것은 불가능하다. MapReduce와 Spark의 파이프라인 차이는 중간 데이터를 메모리에 캐싱하느냐가 아니라, **중간 결과를 디스크나 메모리에 쌓지 않고 다음 연산으로 즉시 흘려보내는 Pipelining이 가능한가**에 있다.

본격적인 파이프라인 비교에 앞서, Spark 환경에서 표준 입력 파일로 사용하는 **Parquet 포맷의 데이터 표현 방식**을 먼저 짚고 넘어간다.

#### 사전 배경: Parquet 파일은 데이터를 어떻게 표현하는가?
일반 텍스트 파일(CSV, JSON)은 파일 안에 `1001,APPLE,50000`처럼 가로 행(Row) 순서대로 글자를 나열한다. 이 방식은 `price` 컬럼 하나만 합산하려고 해도 파일 전체의 `id`와 `name` 문자열까지 디스크에서 전부 읽어야 한다.
반면 **Parquet(Columnar 파일 포맷)**는 데이터를 가로가 아닌 **세로(컬럼)끼리 모아서 배열 형태로 저장**한다.
- 파일 내부에 `id` 값만 100만 개 연속으로 모아둔 구역(`Column Chunk`), `name`만 100만 개 모아둔 구역, `price`만 100만 개 모아둔 구역이 따로 분리되어 있다.
- 또한 파일 맨 끝(`Footer`)에는 각 구역별 최솟값(`Min`)과 최댓값(`Max`) 통계가 적혀 있다. 덕분에 Spark가 Parquet 파일을 읽을 때는 **쿼리에 필요한 컬럼 구역만 골라서 읽고(Column Projection), 조건에 맞지 않는 데이터 블록은 아예 건너뛰는(Skipping)** 고속 스캔이 가능하다.

```mermaid
flowchart LR
    classDef storage fill:#E8F5E9,stroke:#4CAF50,color:#1B5E20;
    classDef process fill:#FFF9C4,stroke:#FBC02D,color:#5D4037;
    classDef cloud fill:#E1F5FE,stroke:#0288D1,color:#01579B;

    subgraph MR_PIPE ["MapReduce: Job마다 HDFS 디스크 기록 강제"]
        direction LR
        HDFS_IN[("HDFS Input")]:::storage
        MR_J1["Job 1: Map -> Reduce"]:::process
        HDFS_MID[("HDFS 중간 저장<br/>3중 네트워크 복제")]:::storage
        MR_J2["Job 2: Map -> Reduce"]:::process
        HDFS_IN -->|"Block Read"| MR_J1
        MR_J1 -->|"Disk & Network Write"| HDFS_MID
        HDFS_MID -->|"다시 전체 Read"| MR_J2
    end

    subgraph SP_PIPE ["Spark: 단일 Stage 내 Whole-Stage CodeGen Pipelining"]
        direction LR
        SP_IN[("Parquet Input<br/>필요 컬럼만 스캔")]:::storage
        FUSED["단일 JVM 루프 (Operator Fusion)<br/>Filter1 -> Map1 -> Filter2 -> Map2"]:::process
        SHUF[("Local Shuffle File<br/>Stage 경계에서만 기록")]:::storage
        SP_IN -->|"Batch Read"| FUSED
        FUSED -->|"레지스터/CPU 캐시 내 즉시 전달"| SHUF
    end
```
<p align="center"><em>Figure 4: MapReduce의 단계별 HDFS 기록 구조와 Spark의 Whole-Stage CodeGen 기반 In-Memory Pipelining 비교</em></p>

### 2.1 실행 그래프와 연산 결합: 2-Stage 강제 분리 대 DAG Operator Fusion

`Filter -> Map -> Filter -> Map -> GroupBy`로 이어지는 처리 파이프라인을 가정해 본다.

#### MapReduce: Rigid Map-Reduce 패러다임
모든 비즈니스 로직을 반드시 `Map`과 `Reduce`라는 두 단계의 틀에 맞춰 쪼개야 한다. 복합 조인이나 다단계 집계를 수행하려면 여러 개의 MapReduce Job을 직렬로 연결해야 한다.
이때 선행 Job이 끝나면 그 결과를 반드시 HDFS에 기록(3중 복제 네트워크 I/O 동반)하고, 후속 Job이 다시 HDFS에서 이를 읽어 들여야 한다. 연산 단계가 늘어날수록 중간 결과물의 Disk 및 네트워크 I/O 비용이 선형적으로 증가한다.

#### Spark: DAG 기반 Stage 분할과 Whole-Stage Code Generation
Spark는 전체 연산을 DAG(Directed Acyclic Graph)로 구성한 뒤, 다른 노드의 데이터와 섞일(Shuffle) 필요가 없는 **Narrow Dependency** 연산(`map`, `filter`, `flatMap`, `project`)을 하나의 Stage로 묶는다.
이후 Catalyst Optimizer의 **Whole-Stage Code Generation**이 동작하여, 여러 연산자의 함수 호출 과정을 없애고 런타임에 아래 코드처럼 **단 하나의 `while` 루프 바이트코드로 합쳐 버린다(Operator Fusion).**

```java
// Spark Whole-Stage CodeGen이 런타임에 생성하는 합성 루프 개념도
while (inputIterator.hasNext()) {
    UnsafeRow row = inputIterator.next();
    // 별도의 중간 컬렉션이나 버퍼에 적재하지 않고 CPU 레지스터/캐시 수준에서 즉시 통과
    if (row.getLong(0) > 1000L) {               // Filter 1
        long price = row.getLong(1) * 110 / 100; // Map 1
        if (price >= 50000L) {                  // Filter 2
            shuffleWriter.write(row.getInt(2), price);
        }
    }
}
```

즉, Spark의 In-Memory Pipelining은 거대한 중간 테이블을 RAM에 쌓아두는 방식이 아니라, **단일 레코드가 CPU 캐시와 레지스터를 타고 Stage 끝단까지 멈추지 않고 흘러가는 Streaming 구조**다. 사용자가 명시적으로 `.cache()`나 `.persist()`를 호출하지 않는 한 중간 결과 자체를 메모리에 적재하지 않는다.

---

### 2.2 Shuffle 메커니즘의 물리적 차이

`GROUP BY dept_no`나 `JOIN`처럼 여러 노드에 흩어진 데이터를 한곳으로 모아야 하는 **Wide Dependency** 구간에서는 Spark 역시 네트워크 전송 전에 **Local Disk에 Shuffle 파일을 기록**한다.

#### 배경 이해: '파티션 ID(Partition ID)'란 무엇이며 왜 자동으로 만들어지는가?
분산 환경에서 10대의 서버가 각자 나눠 가진 데이터에 대해 `GROUP BY dept_no`(부서별 매출 합계)를 수행한다고 가정해 보자. 1번 서버에도 `'개발팀'` 매출이 있고, 2번 서버에도 `'개발팀'` 매출이 있다면, 최종 합계를 구하기 위해서는 **모든 서버가 자신이 가진 `'개발팀'` 데이터를 반드시 다음 Stage의 동일한 Task(예: 3번 Task) 한 곳으로 몰아주어야 한다.**

이를 위해 MapReduce와 Spark의 Shuffle Writer는 데이터를 내보낼 때 다음 규칙에 따라 모든 레코드에 **목적지 번호인 `Partition ID`**를 자동으로 계산해 부여한다.
1. 다음 Stage에서 데이터를 받아 처리할 Task(파티션)의 개수를 정한다(예: Spark 기본값 200개, `0번`부터 `199번`까지).
2. 각 레코드의 집계/조인 기준 컬럼(`Key`, 여기서는 `'개발팀'`)에 해시 함수를 적용한 뒤 파티션 개수로 나눈 나머지 값을 구한다:
   `Partition ID = Hash("개발팀") % 200` (예: 결과가 `3`이면 이 레코드의 목적지는 `3번 파티션`)
3. 이 계산식은 모든 서버에서 동일하므로, 어느 서버에 있던 `'개발팀'` 데이터든 전부 `Partition ID = 3`이라는 목적지 꼬리표를 달게 된다.

이 목적지 번호(`Partition ID`)와 실제 데이터 값(`Key`)을 다루는 정렬 방식에서 MapReduce와 Spark의 차이가 갈린다.

- **MapReduce (목적지 번호 + 실제 Key 값까지 무조건 정렬)**:
  Map Task는 출력 데이터를 `Partition ID`로 묶는 것에 그치지 않고, **각 파티션 내부의 실제 `Key` 값(예: 부서명 알파벳순)까지 무조건 정렬(QuickSort 후 MergeSort)**하여 Disk에 쓴다. 단순 합계(`SUM`)만 구할 때도 불필요한 전체 Key 비교와 레코드 위치 교환 비용이 강제된다.
- **Spark (`Partition ID`별로만 분류 + `Tungsten Sort`의 8바이트 포인터 정렬)**:
  Spark는 별도의 `ORDER BY` 요구가 없는 일반 Shuffle에서는 실제 `Key` 값 정렬을 생략하고, **자동 계산된 목적지 번호(`Partition ID`)가 같은 레코드끼리만 모아서** 단일 데이터 파일과 인덱스 파일로 병합한다.
  정렬이 필요한 경우에도 Spark의 `Tungsten Sort Shuffle`은 크기가 큰 실제 레코드 본문을 메모리에서 직접 복사·이동시키지 않는다. 대신 각 레코드마다 **`[Partition ID (24bit) + 메모리 페이지 번호 (13bit) + 시작 위치 Offset (27bit)]`를 합친 8바이트짜리 숫자(포인터) 배열**을 자동으로 만들고, 이 8바이트 포인터 배열만 정렬한다. 무거운 본문 데이터는 제자리에 둔 채 8바이트 주소록만 정렬하므로 CPU Cache Miss와 메모리 대역폭 소모가 현저히 적다.

---

## 3. Spark 대 분산 분석 DB(Snowflake, ClickHouse) 아키텍처 비교

### 3.0 배경: Spark의 구조적 한계와 분산 분석 DB의 등장, 그리고 공존 이유

Spark가 MapReduce의 한계를 극복하고 빅데이터 표준 엔진으로 자리 잡았음에도, 왜 현업에서는 Snowflake나 ClickHouse 같은 별도의 분산 분석 DB(MPP/OLAP)를 함께 도입할까? 반대로 그렇게 빠른 분산 분석 DB가 있는데도 왜 Databricks를 비롯한 수많은 기업은 여전히 Spark를 핵심 엔진으로 사용할까?

#### (1) Spark가 가진 태생적 한계 (분산 분석 DB가 등장한 이유)
1. **자체 스토리지와 전역 인덱스의 부재**:
   Spark는 데이터를 저장하는 DB가 아니라 외부 스토리지(S3, HDFS)의 파일을 읽어오는 **연산 전용 엔진**이다. 쿼리가 들어올 때마다 S3에 있는 수많은 파일의 메타데이터를 확인하고 스캔해야 하므로, 대시보드에서 0.1-1초 내에 즉각 응답해야 하는 짧은 조회(Ad-hoc/BI)나 초당 수백 개의 동시 쿼리를 처리하는 데는 초기 지연 시간이 크다.
2. **JVM 및 Row 중심 연산의 CPU 효율 한계**:
   `Project Tungsten`으로 GC 문제를 크게 줄였지만, 여전히 JVM 위에서 돌아가며 내부 연산자가 행 단위(`UnsafeRow`) 중심이다. 이 때문에 하드웨어 CPU의 벡터 연산(SIMD)을 100% 활용하는 C++ 네이티브 컬럼형 DB에 비해 단일 코어당 단순 집계·필터링 속도가 느리다.
3. **안정성을 위해 감수하는 Shuffle Disk I/O**:
   Spark는 작업 도중 노드가 죽어도 처음부터 다시 돌리지 않기 위해, 모든 Stage가 끝날 때마다 중간 Shuffle 결과를 로컬 디스크에 파일로 쓴다. 이 안전장치가 몇 초 만에 끝나야 하는 실시간 분석 쿼리에서는 오히려 디스크 I/O 병목이 된다.

#### (2) 그럼에도 Databricks와 엔터프라이즈가 Spark를 사용하는 이유
1. **SQL을 넘어선 범용 프로그래밍과 단일 통합 파이프라인**:
   Snowflake나 ClickHouse는 정형화된 테이블에 대해 SQL로 집계·조회하는 데 특화되어 있다. 반면 실무 데이터 엔지니어링에서는 비정형 텍스트·이미지·복잡한 중첩 JSON 로그를 정규식으로 파싱하거나, 외부 API를 호출하고, Python/Scala 코드로 복잡한 비즈니스 로직과 머신러닝(ML) 피처 엔지니어링을 수행해야 한다. Spark는 하나의 엔진에서 **대규모 ETL + 스트리밍 처리 + ML/AI 파이프라인**을 코드로 자유롭게 구현할 수 있다.
2. **수십 테라바이트급 초대형 배치의 완주 보장(Fault Tolerance)**:
   수십 TB의 원본 데이터를 다단계로 조인하는 무거운 배치에서는 중간에 메모리 부족이나 노드 장애가 흔히 발생한다. 이때 쿼리 전체를 실패 처리하는 분석용 DB와 달리, Spark는 디스크에 남겨둔 Shuffle 파일을 바탕으로 실패한 조각(Task)만 다시 계산해 **시간이 걸리더라도 배치를 끝까지 성공시킨다.**
3. **약점의 흡수 (Lakehouse와 Native 엔진 결합)**:
   최근 Databricks는 Spark의 약점이던 '스토리지 메타데이터 부재'를 **Delta Lake / Apache Iceberg** 테이블 포맷으로 해결하고, 'JVM Row 연산의 한계'는 기존 Spark 코드 변경 없이 내부 실행기만 C++ Vectorized 엔진으로 바꿔치기하는 **Photon 엔진(오픈소스 진영의 Apache Gluten)**으로 극복하며 분산 분석 DB의 영역까지 빠르게 흡수하고 있다.

이러한 배경 위에서 세 엔진의 내부 아키텍처 차이를 비교하면 다음과 같다.

| 구분 | Apache Spark | Snowflake | ClickHouse |
| :--- | :--- | :--- | :--- |
| **핵심 정체성** | 스토리지가 분리된 **범용 분산 연산 엔진** | 스토리지·컴퓨팅 분리형 **클라우드 MPP DW** | 로컬 스토리지 밀착형 **실시간 OLAP DB** |
| **런타임 및 엔진** | **JVM 기반** (Scala/Java) + 일부 Native 확장 | **C++ Native 엔진** (Vectorized) | **C++ Native 엔진** (SIMD 극대화) |
| **메모리 데이터 배치** | **Row 포맷(`UnsafeRow`)** 중심 파이프라인 | 순수 **Columnar Vectorized** 배열 | 순수 **Columnar Vectorized** 배열 |
| **스토리지 및 인덱스** | 외부 포맷 의존 (Parquet, Iceberg, Delta) | 자체 Micro-partition + 글로벌 메타데이터 | `MergeTree` 엔진 + Sparse Primary Index |
| **Stage 간 데이터 전달** | **Local Disk에 Shuffle 파일 영속화** | **네트워크 메모리 직접 스트리밍** (부족 시 Spill) | **네트워크 메모리 직접 스트리밍** |
| **노드 장애 시 복구** | 실패한 Stage의 **해당 Task만 부분 재실행** | **쿼리 전체 재실행** | **쿼리 전체 실패 후 재시도** |

```mermaid
flowchart LR
    classDef storage fill:#E8F5E9,stroke:#4CAF50,color:#1B5E20;
    classDef process fill:#FFF9C4,stroke:#FBC02D,color:#5D4037;
    classDef cloud fill:#E1F5FE,stroke:#0288D1,color:#01579B;

    subgraph SPARK_ENG ["Spark 기본 엔진: Row 변환 및 Disk Shuffle 보장"]
        direction LR
        S_PARQ[("Parquet File<br/>Columnar")]:::storage
        S_ROW["UnsafeRow 변환<br/>Row 단위 루프 연산"]:::process
        S_DISK[("Local Disk Shuffle<br/>Stage 체크포인트")]:::storage
        S_PARQ -->|"ColumnarToRow"| S_ROW
        S_ROW -->|"Fault Tolerance 보장"| S_DISK
    end

    subgraph MPP_ENG ["Snowflake / ClickHouse: C++ Columnar Vectorized & SIMD"]
        direction LR
        M_COL[("Columnar Storage<br/>Micro-partition / MergeTree")]:::storage
        M_VEC["C++ Column Vector Batch<br/>1024-4096개 배열 일괄 SIMD 연산"]:::process
        M_NET(["In-Memory Exchange<br/>노드 간 직접 스트리밍"]):::cloud
        M_COL -->|"무변환 배열 로드"| M_VEC
        M_VEC -->|"Disk 기록 생략"| M_NET
    end
```
<p align="center"><em>Figure 5: Spark의 Row 중심 안전 파이프라인과 분산 분석 DB(Snowflake/ClickHouse)의 C++ Columnar Vectorized 파이프라인 비교</em></p>

### 3.1 실행 엔진: JVM `UnsafeRow` 대 C++ Columnar Vectorized (SIMD)

- **Spark의 구조적 특성**:
  Spark는 디스크나 S3에 저장된 Parquet 같은 Columnar 파일을 읽더라도, 메모리에 올린 뒤 조인이나 집계를 수행할 때는 기본적으로 **`UnsafeRow`라는 행(Row) 단위 바이너리 포맷으로 변환**하여 처리한다(상용 Databricks Photon이나 Apache Gluten 같은 C++ Native 플러그인을 별도로 붙이지 않은 순수 오픈소스 Spark 기준).
  또한 JVM 바이트코드 위에서 동작하므로 하드웨어의 AVX-2, AVX-512 같은 **SIMD(Single Instruction, Multiple Data)** 명령어를 엔진 레벨에서 직접 제어하는 데 한계가 있다.
- **Snowflake와 ClickHouse의 접근**:
  두 DB는 처음부터 **C++로 작성된 Native Vectorized 엔진**이다. 스토리지에서 읽은 컬럼 데이터를 Row로 재조립하지 않고, 메모리상에서도 **동일 컬럼 값들의 연속된 배열(Column Vector Batch, 보통 1,024-4,096개 단위) 형태로 그대로 유지**한다.
  CPU 캐시 라인에 특정 컬럼의 숫자 배열만 연속으로 올라오므로 불필요한 컬럼 데이터를 읽는 메모리 대역폭 낭비가 전혀 없고, 단일 CPU 명령어로 8-16개의 배열 원소를 동시에 더하거나 비교하는 SIMD 연산이 100% 가동된다. 이로 인해 대규모 집계나 필터링에서 JVM 기반 엔진 대비 코어당 연산 처리량이 수 배 이상 높게 나타난다.

#### 3.1.1 Parquet 파일의 물리 구조와 Spark의 `ColumnarToRow` 변환 과정

흔히 "Spark에서 Parquet(컬럼형 파일)를 쓰니까 메모리 연산도 끝까지 컬럼형으로 동작할 것"이라고 생각하기 쉽다. 하지만 실제 Spark UI의 SQL 실행 계획(Physical Plan)을 열어보면 파일 스캔 직후에 **`ColumnarToRow`**라는 연산자가 자동으로 끼어드는 것을 볼 수 있다.

```mermaid
flowchart LR
    classDef storage fill:#E8F5E9,stroke:#4CAF50,color:#1B5E20;
    classDef process fill:#FFF9C4,stroke:#FBC02D,color:#5D4037;
    classDef cloud fill:#E1F5FE,stroke:#0288D1,color:#01579B;

    subgraph PARQ_FILE ["1. Parquet 물리 구조 (Disk)"]
        direction LR
        RG[("Row Group (128MB)<br/>Column Chunk A | Column Chunk B<br/>+ Footer (Min/Max 통계)")]:::storage
    end

    subgraph SPARK_VANILLA ["2. 기본 Spark Catalyst 엔진 (Columnar -> Row 강제 변환)"]
        direction LR
        V_READ["Vectorized Reader<br/>ColumnarBatch (4096행)"]:::cloud
        C2R["ColumnarToRowExec<br/>가로 행(UnsafeRow)으로 재조립"]:::process
        OP_ROW["Filter / HashJoin / Aggregate<br/>Iterator[UnsafeRow] (1행씩 루프)"]:::process
        V_READ -->|"배열 전달"| C2R
        C2R -->|"1행씩 변환 (CPU 소모)"| OP_ROW
    end

    subgraph SPARK_NATIVE ["3. Photon / Apache Gluten (End-to-End Columnar)"]
        direction LR
        N_READ["Native Parquet Reader<br/>ColumnarBatch 유지"]:::cloud
        N_OP["C++ SIMD Filter / Join / Agg<br/>전 구간 Column Vector 연산"]:::process
        N_READ -->|"ColumnarToRow 생략"| N_OP
    end

    RG -->|"필요한 Column Chunk만 I/O"| V_READ
    RG -->|"필요한 Column Chunk만 I/O"| N_READ
```
<p align="center"><em>Figure 6: Parquet 파일 스캔 이후 기본 Spark 엔진의 ColumnarToRow 변환 구조와 Native 엔진(Photon/Gluten)의 차이</em></p>

1. **Parquet 같은 Columnar 파일의 내부 구조**:
   CSV나 JSON 같은 Row 기반 파일은 한 줄에 한 사람의 모든 컬럼(`id, name, price, date`)을 이어서 기록한다. 반면 **Apache Parquet**나 **Apache ORC** 같은 Columnar 파일은 데이터를 다음과 같은 계층으로 쪼개어 저장한다.
   - **Row Group**: 전체 데이터를 가로로 수십만에서 수백만 행(보통 128MB-1GB) 단위로 먼저 나눈 큰 블록이다.
   - **Column Chunk & Page**: 하나의 Row Group 안에서는 데이터를 다시 **컬럼별로 완전히 분리**하여 `[id 100만 개 연속]`, `[name 100만 개 연속]`, `[price 100만 개 연속]` 형태의 `Column Chunk`로 모아서 저장한다(내부적으로는 1MB 단위의 `Page`로 쪼개어 압축).
   - **File Footer**: 파일 맨 끝에는 스키마 정보와 함께 각 Row Group 내 컬럼별 `Min/Max`, `Null Count` 같은 통계 메타데이터가 기록되어 있다.
   - **이점**: 같은 데이터 타입과 유사한 값들이 연속되어 있으므로 Dictionary Encoding이나 Run-Length Encoding(RLE) 압축률이 높고, 쿼리에 필요한 컬럼의 `Column Chunk`만 디스크에서 골라 읽는 **Column Projection**이 가능하다.

2. **Spark의 `VectorizedParquetRecordReader`와 `ColumnarToRow`의 한계**:
   Spark 2.0부터 도입된 **Vectorized Parquet Reader**는 Parquet 파일의 `Column Chunk`를 읽을 때 디스크 I/O와 압축 해제 속도를 높이기 위해, 메모리에 `ColumnarBatch`(기본 4,096개 행의 컬럼 배열 묶음) 형태로 한 번에 퍼 올린다.
   문제는 **그 다음 단계인 Catalyst/Tungsten 실행 엔진의 코어 연산자들**이다.
   - Spark의 기본 연산자(`FilterExec`, `ProjectExec`, `BroadcastHashJoinExec`, `SortMergeJoinExec`, `HashAggregateExec`, `TungstenExchange` 등)는 내부 인터페이스가 `ColumnarBatch`가 아니라 **행 단위 바이너리 포맷인 `UnsafeRow`를 1건씩 주고받는 `Iterator[UnsafeRow]`**로 설계되어 있다.
   - 그 결과 Parquet 리더가 4,096개짜리 컬럼 배열(`ColumnarBatch`)을 메모리에 올려놓자마자, 바로 뒷단에 붙은 **`ColumnarToRowExec` 연산자가 세로 방향의 컬럼 배열들을 가로 방향의 `UnsafeRow`로 1행씩 다시 조립(Transpose)**한 뒤 `while (iterator.hasNext())` 루프로 밀어 넣는다.
   - 즉, **"디스크 저장 포맷(Parquet)과 파일 리더만 Columnar일 뿐, Spark 기본 엔진의 실제 메모리 연산 파이프라인(Filter, Join, GroupBy)은 여전히 Row 단위 Iterator로 동작한다"**는 뜻이다. 이 과정에서 배열을 다시 행으로 쪼개고 합치는 `ColumnarToRow` / `RowToColumnar` 변환 자체가 전체 쿼리 CPU 시간의 20-40%를 소모하기도 한다.

3. **상용 Databricks Photon과 오픈소스 Apache Gluten의 역할**:
   이 병목을 근본적으로 없애기 위해 등장한 것이 Databricks의 상용 C++ 엔진인 **Photon**과, Intel·Meta 등이 주도하는 오픈소스 **Apache Gluten(내부 백엔드로 Meta의 C++ Velox 엔진이나 ClickHouse 엔진을 결합)**이다.
   이 엔진들은 Spark의 실행 계획에서 `ColumnarToRow`를 제거하고, Parquet에서 읽은 `ColumnarBatch`를 Row로 변환하지 않은 채 **Join, Aggregation, Shuffle까지 전 과정을 Snowflake·ClickHouse처럼 C++ Columnar Vectorized 연산으로 끝까지 처리**한다.

### 3.2 스토리지 결합도와 Data Skipping 수준

- **Spark (스토리지 비종속성에 따른 한계)**:
  Spark는 자체 스토리지 엔진이 없다. S3의 Parquet 파일을 읽을 때 파일 Footer의 Min/Max 통계를 보고 Row Group을 건너뛰는 Predicate Pushdown을 지원하지만, 파일을 열기 전에 어떤 파일에 어떤 데이터가 있는지 전역적으로 관리하는 중앙 인덱스가 없다. 이를 보완하기 위해 최근에는 Apache Iceberg나 Delta Lake 같은 테이블 포맷 계층을 얹어 Manifest 파일 단위의 Pruning을 수행한다.
- **Snowflake (Micro-partitions와 Cloud Services 메타데이터 계층)**:
  Snowflake는 데이터를 적재할 때 압축 전 기준 50-500MB 단위의 불변 파일인 `Micro-partition`으로 쪼개어 오브젝트 스토리지에 저장한다. 이때 각 파티션 내부의 모든 컬럼에 대한 Min/Max, Distinct Count, Null 여부 등의 통계를 추출하여 **독립된 Cloud Services 계층(FoundationDB 기반 분산 메타데이터 저장소)**에 기록한다.
  쿼리가 유입되면 컴퓨팅 노드(Virtual Warehouse)가 S3의 실제 파일을 열어보기도 전에, 컴파일 단계에서 메타데이터 서비스만 조회하여 읽어야 할 Micro-partition 목록을 수 밀리초 내에 확정한다.
- **ClickHouse (`MergeTree`와 Sparse Primary Index)**:
  ClickHouse는 클라우드 오브젝트 스토리지보다 워커 노드의 **로컬 NVMe SSD**에 데이터를 밀착 배치할 때 가장 높은 성능을 내도록 설계되었다. 데이터를 적재할 때 지정된 `ORDER BY` 키 기준으로 물리적 정렬을 강제하며, 기본 8,192개 행(`index_granularity`) 묶음인 Granule마다 대표 키 값 하나씩만 추출한 **Sparse Index**를 메모리에 상주시킨다.
  수십억 건의 데이터가 쌓여도 인덱스 크기가 수 메가바이트에 불과해 항상 RAM에 상주하며, 조건절 조회 시 필요한 파일 블록 Offset으로 즉시 Seek하여 읽어낸다.

### 3.3 장애 복구(Fault Tolerance)와 Shuffle의 트레이드오프

일반적인 조회 및 집계 쿼리에서는 Snowflake나 ClickHouse가 Spark보다 훨씬 빠른 응답 속도를 보여주지만, 수십 테라바이트 규모의 장시간 배치나 복잡한 비정형 데이터 가공에서는 여전히 Spark가 표준으로 사용된다. 그 이유는 **Stage 간 Shuffle 데이터의 영속화 여부와 장애 복구 비용의 차이** 때문이다.

- **분산 분석 DB (속도를 위한 Pipeline Streaming Exchange)**:
  Snowflake나 ClickHouse 같은 MPP DB는 대화형 쿼리 응답 시간(Latency)을 줄이기 위해, 노드 간 데이터를 주고받을 때 Disk에 체크포인트 파일을 남기지 않고 **네트워크 소켓을 통해 다음 노드의 메모리로 직접 스트리밍(Exchange Operator)**하는 방식을 기본으로 채택한다(메모리 한계 도달 시에만 임시 Spill 발생).
  만약 1시간 동안 수행되는 초대형 배치 쿼리가 55분째에 특정 워커 노드의 하드웨어 결함이나 OOM으로 중단되면, 중간 Stage의 결과물이 어디에도 남아있지 않으므로 **55분간의 작업을 모두 폐기하고 쿼리 전체를 처음부터 다시 실행**해야 한다. 특히 ClickHouse는 분산 대규모 테이블 간 Hash Join 시 우측 테이블을 메모리에 적재하다가 메모리 제한에 걸려 쿼리가 중단되는 일이 잦다.
- **Spark (완주 보장을 위한 Shuffle Materialization)**:
  Spark는 Stage가 끝날 때마다 Shuffle 데이터를 반드시 워커 노드의 Local Disk에 파일로 기록한다. 이 디스크 I/O 때문에 짧은 대화형 쿼리에서는 MPP DB보다 느리지만, 100대의 노드 중 1대가 55분째에 죽더라도 **쿼리 전체를 취소하지 않고 직전 Stage의 로컬 Shuffle 파일을 읽어 죽은 노드가 맡았던 Task 몇 개만 다른 노드에서 재실행(Re-compute)**하여 작업을 끝까지 완수한다.

---

## 4. Columnar Vectorized 실행 엔진과 하드웨어 SIMD 내부 원리

Snowflake와 ClickHouse 같은 최신 분석용 DB가 CPU 코어당 처리량에서 기존 엔진을 크게 앞서는 핵심 비결은 **Columnar Vectorized Execution**과 하드웨어 **SIMD(Single Instruction, Multiple Data)**의 결합에 있다. 이 아키텍처는 2005년 CIDR에 발표된 *MonetDB/X100: Hyper-Pipelining Query Execution* 논문에서 정립되었으며, 해당 연구를 주도한 Marcin Zukowski가 이후 Snowflake를 공동 창업하면서 현대 클라우드 MPP 엔진의 표준이 되었다.

```mermaid
flowchart LR
    classDef storage fill:#E8F5E9,stroke:#4CAF50,color:#1B5E20;
    classDef process fill:#FFF9C4,stroke:#FBC02D,color:#5D4037;
    classDef cloud fill:#E1F5FE,stroke:#0288D1,color:#01579B;

    subgraph ROW_MODE ["Row 기반 처리: Cache Line 오염 및 스칼라 연산"]
        direction LR
        R_MEM[("64B Cache Line<br/>[ID | Name | Price | Date]")]:::storage
        R_ALU["일반 64-bit 레지스터 (SISD)<br/>1 클럭당 Price 1건 연산"]:::process
        R_BR["if 조건 분기 (Branch)<br/>예측 실패 시 파이프라인 Stall"]:::cloud
        R_MEM -->|"56B 버림 / 8B만 사용"| R_ALU
        R_ALU -->|"매 행 분기 평가"| R_BR
    end

    subgraph VEC_MODE ["Columnar Vectorized: Cache Line 100% 활용 및 SIMD 병렬 연산"]
        direction LR
        C_MEM[("64B Cache Line<br/>[P1 | P2 | ... | P16] (int32 x 16)")]:::storage
        C_SIMD["512-bit ZMM 레지스터 (AVX-512)<br/>1 클럭당 Price 16건 동시 연산"]:::process
        C_MASK["Branchless Bitmask / Selection Vector<br/>분기 없이 통과 인덱스만 마스킹"]:::cloud
        C_MEM -->|"64B 전체 적재 (L1 Cache 상주)"| C_SIMD
        C_SIMD -->|"단일 SIMD 비교 명령"| C_MASK
    end
```
<p align="center"><em>Figure 7: Row 기반 스칼라 실행 모델과 Columnar Vectorized SIMD 실행 모델의 CPU 캐시 및 레지스터 활용 비교</em></p>

### 4.1 기존 Volcano(Tuple-at-a-time) 모델의 CPU 병목

전통적인 RDBMS와 초기 쿼리 엔진은 `Scan -> Filter -> Project -> Aggregate`로 이어지는 연산자 트리에서 상위 연산자가 하위 연산자의 `next()` 함수를 호출해 레코드를 1건씩 끌어올리는 **Volcano Iterator 모델**을 사용했다.
- **가상 함수 호출 Overhead**: 1억 건의 행을 처리할 때 연산자 단계가 4단계라면 `next()` 가상 함수(Virtual Function Call)가 4억 번 호출된다.
- **CPU 파이프라인 효율 저하**: MonetDB/X100 논문이 TPC-H 쿼리 실행 시 CPU 사이클을 프로파일링한 결과, **실제 값을 더하거나 비교하는 순수 데이터 연산에는 전체 CPU 사이클의 10% 미만만 사용**되었고, 나머지 90% 이상은 루프 제어, 함수 호출 스택 관리, 포인터 역참조, Instruction Cache Miss에 소모되었다.

### 4.2 64-Byte CPU Cache Line과 Memory Layout 효율

현대 CPU는 메인 메모리(RAM)에서 데이터를 읽을 때 필요한 4바이트나 8바이트만 가져오지 않고, 항상 **64바이트 크기의 Cache Line** 단위로 묶어서 L1/L2/L3 캐시로 가져온다.

- **Row Layout의 Cache Pollution**:
  한 행이 `order_id(8B)`, `item_name(32B)`, `price(8B)`, `order_date(16B)`로 구성된 64바이트 레코드라고 가정한다. `SELECT SUM(price) FROM sales` 쿼리를 수행할 때, Row 기반 메모리 구조에서는 `price` 8바이트 하나를 읽기 위해 나머지 56바이트의 불필요한 컬럼 데이터까지 L1 캐시로 함께 끌고 들어온다. 결국 **메모리 대역폭과 CPU L1 캐시 공간의 87.5%(56/64)가 쓰이지도 않는 데이터로 채워지는 Cache Pollution**이 발생한다.
- **Columnar Layout의 100% 밀도**:
  컬럼형 메모리 구조에서는 `price` 값만 메모리 주소상에 연속된 배열로 배치된다. CPU가 64바이트 Cache Line 하나를 읽으면 4바이트 정수(`int32`) 기준 **16개의 `price` 값이 빈틈없이 L1 캐시에 적재**되며, Hardware Prefetcher가 다음 배열 주소를 정확히 예측해 메모리 지연(Memory Stall)을 숨겨준다.

### 4.3 왜 전체 컬럼이 아니라 1,024-4,096개 단위의 Vector Batch인가?

컬럼형 처리라고 해서 수천만 건의 컬럼 배열 전체를 한 번에 끝까지 연산(`Column-at-a-time`)하면 또 다른 병목이 발생한다.
- 첫 번째 연산자가 1억 개짜리 컬럼 배열을 계산해 만든 중간 결과 배열(수백 MB)은 **CPU L1/L2 캐시 용량(코어당 수십 KB에서 수백 KB)을 초과하여 다시 느린 메인 메모리(RAM)로 밀려나기(Spill to RAM) 때문**이다.
- 따라서 Vectorized 실행 엔진은 `next()`를 호출할 때 1개의 행도 아니고 전체 컬럼도 아닌, **CPU L1/L2 캐시 크기에 정확히 들어맞는 1,024-4,096개 원소 묶음(Vector Batch)** 단위로 배열을 잘라서 전달한다.
- 이를 통해 `next()` 함수 호출 횟수를 기존의 1,000분의 1 이하로 줄이면서도, 연산 중간 결과가 RAM으로 내려가지 않고 **CPU L1 캐시 내부에서만 순환하며 다음 연산자로 즉시 넘어가도록 보장**한다.

### 4.4 하드웨어 SIMD 명령어와 Branchless 실행

메모리에 데이터가 1차원 연속 배열(Vector Batch)로 정렬되어 있으면, 컴파일러와 엔진은 CPU의 **SIMD 레지스터**와 **Branchless(분기 제거) 기법**을 사용할 수 있다.

#### (1) SISD(Scalar) 대 SIMD(Vector) 연산
일반 스칼라 연산(SISD)은 64비트 일반 레지스터에 값 1개를 넣고 1번의 CPU 명령어로 1쌍의 값만 더한다. 반면 최신 x86-64 CPU가 제공하는 `AVX-2`(256-bit `YMM` 레지스터)나 `AVX-512`(512-bit `ZMM` 레지스터)는 **단 1개의 레지스터에 32비트 정수(`int32`) 16개를 동시에 적재**한다.

```cpp
// 1. 일반 Scalar 루프 (1회 루프당 1개 원소 처리 + 조건 분기 발생)
for (int i = 0; i < 4096; ++i) {
    if (price[i] > 50000) { // 데이터 값에 따라 CPU 분기 예측 실패(Branch Misprediction) 발생
        total += price[i] * quantity[i];
    }
}

// 2. AVX-512 SIMD Vectorized 루프 개념 (1회 루프당 16개 원소를 분기 없이 동시 처리)
__m512i v_threshold = _mm512_set1_epi32(50000);
__m512i v_total = _mm512_setzero_si512();

for (int i = 0; i < 4096; i += 16) {
    __m512i v_price = _mm512_load_si512(&price[i]);       // 연속된 16개 price 일괄 로드 (64 Bytes)
    __m512i v_qty   = _mm512_load_si512(&quantity[i]);    // 연속된 16개 quantity 일괄 로드
    
    // if 분기문 없이 16개 원소를 동시 비교하여 16-bit Mask(예: 01011001...) 생성
    __mmask16 mask  = _mm512_cmpgt_epi32_mask(v_price, v_threshold);
    
    // 16개 원소 동시 곱셈 후, Mask가 1인 위치만 골라서 v_total에 누적 (Branchless)
    __m512i v_prod  = _mm512_mullo_epi32(v_price, v_qty);
    v_total         = _mm512_mask_add_epi32(v_total, mask, v_total, v_prod);
}
```

#### (2) Branchless Execution과 Selection Vector
CPU는 명령어 처리 속도를 높이기 위해 15-20단계의 파이프라인을 미리 채워 실행하며, `if` 조건문을 만나면 결과가 나오기 전에 어느 쪽으로 갈지 미리 추측하는 **Branch Prediction(분기 예측)**을 수행한다.
만약 `WHERE price > 50000` 조건의 참/거짓 비율이 50%에 가까워 무작위로 섞여 있다면, CPU의 분기 예측이 계속 빗나가면서 미리 실행해 둔 파이프라인을 전부 비우고 다시 시작하는 **Branch Misprediction Penalty(1회당 15-20 클럭 손실)**가 발생한다.

ClickHouse나 Snowflake의 Vectorized 엔진은 위 코드 예시처럼 `if` 문을 쓰지 않는다. 대신 SIMD 비교 명령어를 통해 조건을 만족하는 위치만 `1`로 표시한 **Bitmask**나 통과한 행의 인덱스 번호만 모아둔 **Selection Vector(예: `[1, 3, 4, 7]`)** 배열을 생성한다. 분기 자체가 사라지므로 CPU 파이프라인이 단 한 번도 멈추지 않고 최고 클럭 속도로 배열을 밀어낸다.

#### (3) 왜 순수 JVM에서는 SIMD 극대화가 어렵고 C++ Native 엔진이 유리한가?
JVM의 JIT Compiler(C2)도 단순 배열 루프를 SIMD로 바꿔주는 Auto-Vectorization 기능을 가지고 있다. 하지만 기본 Spark 엔진에서는 다음과 같은 이유로 SIMD 변환이 자주 무력화된다.
- Spark의 `UnsafeRow`는 모든 컬럼이 붙어 있는 Row 포맷이므로 동일 컬럼 값들이 메모리상에 연속된 배열로 놓여 있지 않다.
- 루프 내부에 Null 비트셋 확인, 가변 길이 Offset 계산, JVM SafePoint 폴링, 배열 경계 검사(Bounds Check) 같은 부가 명령이 끼어들면 JIT Compiler가 패턴 인식을 포기하고 일반 스칼라 명령어로 컴파일한다.

이러한 JVM의 구조적 한계를 극복하기 위해 최근 Spark 생태계에서도 기본 JVM 실행 엔진을 걷어내고, Snowflake·ClickHouse와 동일한 **C++ Columnar Vectorized 엔진을 JNI로 결합하는 아키텍처(상용 Databricks Photon 엔진, 오픈소스 Apache Gluten + Meta Velox 엔진)**가 빠르게 도입되고 있다.

---

## 5. 요약 및 워크로드별 선택 기준

세 가지 기술의 내부 메커니즘 차이를 실무 아키텍처 선택 기준으로 정리하면 다음과 같다.

1. **MapReduce에서 Spark로의 전환 이유**:
   MapReduce의 Task당 1회용 JVM 생성 비용과 Job 간 HDFS 강제 쓰기 병목을 해결하기 위해, Spark는 **종료되지 않고 재사용되는 Executor Thread Pool**, **Off-Heap 기반의 `UnsafeRow` 바이너리 메모리 관리**, 그리고 **Narrow Dependency 구간을 단일 루프로 합치는 In-Memory Pipelining**을 도입했다.
2. **Spark가 적합한 영역**:
   정형 SQL뿐만 아니라 비정형 텍스트·로그 파싱, 외부 API 호출, 머신러닝 파이프라인 등 **코드 수준의 유연한 제어**가 필요할 때, 그리고 수 시간 이상 소요되는 초대형 데이터 조인·변환 배치에서 **특정 노드 장애나 데이터 Skew가 발생해도 끝까지 작업을 완주(Task 단위 부분 복구)**해야 하는 ETL 파이프라인에 적합하다.
3. **Snowflake가 적합한 영역**:
   스토리지와 컴퓨팅(Virtual Warehouse)의 완전한 분리를 통해 워크로드별 격리와 즉시 스케일링이 필요할 때, 그리고 글로벌 메타데이터 Pruning과 C++ Vectorized 엔진을 바탕으로 **복잡한 다중 테이블 JOIN 및 전사 BI/Ad-hoc 분석 쿼리**를 운영 부담 없이 처리하고자 할 때 적합하다.
4. **ClickHouse가 적합한 영역**:
   복잡한 다중 테이블 JOIN보다는 넓게 비정규화된(Wide Table) 단일 테이블이나 소수 테이블 위에서, C++ SIMD 연산과 `MergeTree` Sparse Index를 활용해 **수억에서 수십억 건의 로그·이벤트·시계열 데이터를 서브초(Sub-second) 단위로 실시간 집계**해야 하는 대고객 대시보드 및 관측성(Observability) 시스템에 적합하다.
