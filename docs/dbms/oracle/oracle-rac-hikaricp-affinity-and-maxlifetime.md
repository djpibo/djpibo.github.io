---
id: oracle-rac-hikaricp-affinity-and-maxlifetime
title: "Oracle RAC 환경의 HikariCP 노드 쏠림 진단: Connection Affinity 한계와 maxLifetime을 통한 부하 분산 전략"
sidebar_label: Oracle RAC & HikariCP 노드 쏠림 진단
sidebar_position: 8
date: "2026년 9월 14일"
reading_time: "약 10분"
---

# Oracle RAC 환경의 HikariCP 노드 쏠림 진단: Connection Affinity 한계와 maxLifetime을 통한 부하 분산 전략

2개 이상의 인스턴스가 단일 스토리지를 공유하는 Oracle RAC(Real Application Clusters) 환경은 고가용성(HA)뿐만 아니라 다중 노드를 통한 작업 부하 분산(Load Balancing)을 핵심 목표로 삼는다.  
그러나 애플리케이션 계층에서 Java 진영의 표준 커넥션 풀인 HikariCP를 기본 설정으로 연동할 경우, 클러스터의 장점을 살리지 못하고 특정 단일 노드로만 트랜잭션이 쏠리는 병목이 자주 발생한다.

특히 복수의 Step에 걸쳐 대량의 SQL을 연속으로 호출하는 대규모 배치(Batch) 작업에서 이러한 현상이 두드러진다.  
본 글에서는 HikariCP 고유의 커넥션 관리 메커니즘으로 인해 발생하는 RAC 노드 편중 현상의 물리적 원인을 분석하고, `maxLifetime` 파라미터 조정을 통해 노드 간 부하 평준화를 달성한 프로덕션 엔지니어링 사례와 트레이드오프를 공유한다.

---

## 1. 문제 상황: 단일 노드 CPU 80% 경보와 유휴 노드의 공존

배치 애플리케이션이 동작하는 새벽 시간대, Oracle RAC Node 1의 CPU 점유율이 80%를 넘어서며 시스템 경보가 발생했다.

```
[ RAC 2-Node 실시간 CPU 점유율 대조 ]
- RAC Node 1 : CPU 83% (Alert 발생, Foreground 작업 적체)
- RAC Node 2 : CPU 6%  (Idle 상태, 유휴 자원 방치)
```

클러스터 전체 관점에서 가용 코어(Core) 자원의 절반이 완전히 놀고 있는 상태였다.  
이러한 상황에서 인프라 관점의 단순한 판단은 "배치 수행 중 DB CPU가 포화되었으니 DB 노드 사양을 스케일업(Scale-up)해야 한다"는 결론으로 흐르기 쉽다.

그러나 2개 노드로 구성된 RAC 환경에서 절반의 하드웨어 리소스가 방치된 채 특정 노드만 증설하는 조치는 근본적인 원인을 외면한 비효율적인 비용 낭비에 불과했다. 필요한 조치는 인프라 증설이 아니라, 애플리케이션 계층과 DB 클러스터 간의 **물리 커넥션 라우팅 메커니즘 정상화**였다.

---

## 2. 근본 원인 분석: Oracle LBA 가중치와 멀티 스레드 배치의 초기 쏠림 충돌

클러스터 레벨에서 로드밸런싱이 무력화되고 단일 노드에 부하가 집중된 이유는, Oracle RAC가 제공하는 동적 로드밸런싱 권고(LBA) 메커니즘과 멀티 스레드 배치 환경에서 동작하는 HikariCP의 내부 풀링 아키텍처가 정면으로 상충했기 때문이다.

```mermaid
flowchart LR
    subgraph MultiBatch["멀티 스레드 배치 (10 Worker Threads)"]
        direction TB
        T1["Thread 1"]
        T2["Thread 2"]
        TDots["Thread 3 ~ 9 ..."]
        T10["Thread 10"]
    end

    subgraph HikariPool["HikariCP Pool (10 Connections)"]
        direction TB
        C1["Conn 1"]
        C2["Conn 2"]
        CDots["Conn 3 ~ 9 ..."]
        C10["Conn 10"]
        PoolNote["초기 버스트 생성된<br/>10개 커넥션 영구 유지<br/><i>(maxLifetime 30분)</i>"]
    end

    subgraph RACCluster["Oracle RAC 2-Node Cluster"]
        direction TB
        subgraph Node1["RAC Node 1 (과부하 집중)"]
            P1["10개 Server Process<br/><b>CPU 83% 포화</b>"]
            SGA1[("Buffer Cache / SGA")]
        end
        subgraph Node2["RAC Node 2 (완전 유휴)"]
            P2["수신 프로세스 없음<br/><b>CPU 6% 유휴</b>"]
            SGA2[("Buffer Cache / SGA")]
        end
    end

    subgraph Advisory["오라클 LBA (GV$SERVICE_LB_METRIC)"]
        direction TB
        LBA["Node 1 가중치: 5% (과열)<br/><b>Node 2 가중치: 95% (추천)</b>"]
        LBANote["<i>*신규 연결 시에만 참조되므로<br/>이미 맺어진 풀에서는 무용지물</i>"]
    end

    MultiBatch ==>|"10개 스레드가 10개 커넥션 전담 점유"| HikariPool
    HikariPool ==>|"10개 물리 세션이 Node 1에 독점 바인딩"| P1
    HikariPool -. "풀 내부 무한 재사용으로 신규 연결 0건" .x Node2
    Advisory -. "신규 요청 없어 가중치 전달 불가" .-> HikariPool

    classDef thread fill:#E1F5FE,stroke:#0288D1,stroke-width:1.2px,color:#01579B;
    classDef pool fill:#FFF9C4,stroke:#FBC02D,stroke-width:1.5px,color:#5D4037;
    classDef node1 fill:#FFCDD2,stroke:#D32F2F,stroke-width:2px,color:#B71C1C;
    classDef node2 fill:#E8F5E9,stroke:#4CAF50,stroke-width:1.5px,color:#1B5E20;
    classDef lba fill:#F3F4F6,stroke:#616161,stroke-width:1.2px,color:#212121;

    class T1,T2,TDots,T10 thread;
    class C1,C2,CDots,C10,PoolNote pool;
    class Node1,P1 node1;
    class Node2,P2 node2;
    class Advisory,LBA,LBANote lba;

    style MultiBatch fill:#FAFAFA,stroke:#90CAF9,stroke-width:1.5px,stroke-dasharray: 6 4
    style HikariPool fill:#FAFAFA,stroke:#FBC02D,stroke-width:1.5px,stroke-dasharray: 6 4
    style RACCluster fill:#FAFAFA,stroke:#9E9E9E,stroke-width:1.5px,stroke-dasharray: 6 4
    style Advisory fill:#FFFFFF,stroke:#BDBDBD,stroke-width:1.2px
```
<p align="center"><em>Figure 1: 멀티 스레드 배치의 10개 커넥션 초기 버스트 수립과 LBA 메트릭 무력화로 인한 단일 노드 쏠림</em></p>

### 2.1. Oracle LBA(Load Balancing Advisory) 메커니즘과 SCAN의 한계
Oracle RAC는 단순히 무작위로 접속을 나누는 것이 아니라, 각 노드의 실시간 부하 상태를 정밀하게 수집하여 접속 가중치를 산출하는 **LBA(Load Balancing Advisory)** 기능을 내장하고 있다.

1. **백그라운드 메트릭 수집 (LREG / PMON)**:  
   인스턴스 백그라운드 프로세스인 LREG(Listener Registration)는 각 노드의 실시간 CPU 사용률, 활성 세션 수, 서비스별 응답 시간(Service Time), 처리량(Throughput), 롱쿼리(Long Query) 실행 부하를 주기적으로 수집한다.
2. **동적 가중치 산출 (`GV$SERVICE_LB_METRIC`)**:  
   오라클은 이 성능 지표를 기반으로 어떤 노드가 더 한가한지를 백분율(Percentage) 점수로 환산하여 딕셔너리 뷰에 등록하고, SCAN Listener와 Local Listener에 브로드캐스팅한다.

```sql
-- 실시간 RAC 노드별 서비스 부하 가중치 확인 쿼리
SELECT 
    inst_id,
    service_name,
    nodename,
    percent,       -- 신규 접속을 해당 노드로 할당할 추천 가중치 (0~100%)
    status,        -- 노드 상태 (GOOD 등)
    elapsed_time   -- 지표 갱신 인터벌
FROM gv$service_lb_metric
ORDER BY service_name, inst_id;
```

서비스 설정 시 `CLB_GOAL=SHORT`(`DBMS_SERVICE`) 옵션이 부여되어 있으면, SCAN Listener는 신규 연결 요청이 들어올 때 이 `GV$SERVICE_LB_METRIC`의 `PERCENT` 가중치를 바탕으로 부하가 적은 노드로 세션을 보낸다.  
- Node 1이 과열되면 Node 1의 `PERCENT`는 5%로 급락하고, 한가한 Node 2의 `PERCENT`는 95%로 치솟는다.

**그러나 치명적인 한계가 존재한다.**  
SCAN Listener와 Local Listener는 오직 **클라이언트가 신규 물리 TCP 연결(Handshake)을 맺기 위해 `CONNECT_DATA` 패킷을 전송하는 시점에만 이 가중치 테이블을 조회**한다.  
일단 소켓이 체결되어 Dedicated Server Process가 배정되고 나면, 이후 실행되는 수백만 번의 배치 SQL은 리스너를 완전히 거치지 않고(Bypass) 해당 노드의 서버 프로세스와 직접 통신한다.

---

### 2.2. 멀티 스레드 배치의 초기 10개 커넥션 쏠림과 편중 고착화 과정
해당 배치 애플리케이션은 10개의 워커 스레드(`ThreadPoolTaskExecutor`)를 가동하며, HikariCP의 풀 크기도 10개(`maximum-pool-size=10`, `minimum-idle=10`)로 구성된 전형적인 **멀티 스레드 병렬 배치 구조**였다.  
10개의 커넥션을 맺고 출발하는 멀티 스레드 배치가 왜 특정 한쪽 노드로 완전히 쏠려버리는지는 4단계의 시간 순서로 설명된다.

#### 1단계: Cold Start 버스트 접속 (Burst Connection)
배치 프로세스가 최초 구동되는 시점에는 Node 1과 Node 2 모두 CPU가 0~5% 수준으로 평온하다.  
이 시점 `GV$SERVICE_LB_METRIC`의 가중치(`PERCENT`)는 양 노드 모두 50:50으로 균등하다.  
10개의 작업 스레드가 동시에 기동되면서, 불과 수십 밀리초(ms) 사이에 10개의 물리 DB 커넥션을 한꺼번에 요청(Burst Initialization)한다.  
이때 클라이언트 DNS는 보통 3개의 SCAN IP 중 하나를 반환하고, 찰나의 순간 인입된 10개의 핸드셰이크 요청이 동일한 SCAN Listener를 거쳐 우연히 **Node 1의 Local Listener로 집중 핸드오버**된다. 그 결과 10개의 물리 커넥션이 모두 Node 1에 생성된다.

#### 2단계: LREG 메트릭 수집 및 보고 지연 (Reporting Lag)
LREG 프로세스가 인스턴스 부하 변화를 감지하고, 가중치를 다시 계산하여 리스너에 통보하기까지는 통상 수 초(3~5초) 이상의 주기가 소요된다.  
HikariCP 풀이 10개의 연결을 일괄 체결하는 속도가 LREG의 메트릭 브로드캐스팅 주기보다 훨씬 빠르기 때문에, 로드밸런서가 부하 차이를 인지하기도 전에 이미 10개 커넥션이 Node 1에 전부 못 박힌다.

#### 3단계: 10개 스레드의 지속적 쿼리 실행 및 LBA 무력화
10개 워커 스레드는 풀에 확보된 10개의 커넥션을 각자 하나씩 쥐고 대량의 배치 청크(Chunk) SQL을 맹렬하게 실행하기 시작한다.  
Node 1의 CPU는 즉각 83%로 치솟는다.  
이 시점에 이르러서야 LREG는 사태를 파악하고 `GV$SERVICE_LB_METRIC`에서 Node 1의 가중치를 5%로 깎고, Node 2의 가중치를 95%로 극단 상향한다. SCAN Listener는 "다음 접속이 들어오면 무조건 Node 2로 보내겠다"며 준비 태세를 갖춘다.

#### 4단계: 리스너 바이패스와 영구적 노드 결합 (Connection Affinity)
**그러나 다음 접속은 영원히 오지 않는다.**  
HikariCP는 커넥션 풀이다. 10개 스레드는 10개의 커넥션을 풀 내부에서 `Check-out` → 트랜잭션/SQL 실행 → `Check-in`하며 계속해서 돌려 쓸 뿐, 풀 밖으로 나가서 리스너에게 새로운 연결을 달라고 요청할 이유가 전혀 없다.  
더욱이 기본 설정상 `maxLifetime`이 30분(`1800000ms`)으로 길게 잡혀 있으므로, 10분 동안 실행되는 배치 작업 내내 단 한 번의 커넥션 재생성도 발생하지 않는다.

결과적으로 오라클 LBA 메트릭(`GV$SERVICE_LB_METRIC`)이 아무리 Node 2로 가라고 95% 가중치를 외쳐도, HikariCP는 이미 맺어둔 10개의 Node 1 커넥션만 쥐고 10개 스레드가 Node 1만 지속적으로 폭격하게 된다. 반대편 Node 2는 프로세스가 단 하나도 배정되지 않은 채 CPU 6%의 완전한 유휴 상태로 배치가 끝날 때까지 방치된다.

### 2.3. Oracle UCP 대비 범용 풀의 태생적 제약
Oracle 전용 커넥션 풀인 UCP(Universal Connection Pool)는 FCF(Fast Connection Failover) 및 ONS(Oracle Notification Service)와 긴밀히 연동되어, 런타임 트랜잭션 부하에 따라 세션을 동적으로 라우팅하는 RCLB(Runtime Connection Load Balancing) 기능을 제공한다.  
반면 HikariCP와 같은 오픈소스 범용 풀은 RAC의 런타임 인스턴스 메트릭을 알지 못하므로, 커넥션 풀 레벨에서 의도적인 순환 메커니즘을 설계하지 않으면 RAC 환경에서 노드 편중을 피하기 어렵다.

---

## 3. 해결 전략: maxLifetime 조정을 통한 주기적 커넥션 회전

물리 커넥션이 한 번 맺어진 채 반영구적으로 유지되는 것이 문제의 원인이라면, 커넥션의 생명주기를 의도적으로 단축시켜 **SCAN 로드밸런싱이 주기적으로 다시 개입하도록 유도**하는 것이 가장 확실한 해법이다.

```mermaid
flowchart LR
    subgraph PoolCycle["HikariCP 커넥션 순환 사이클"]
        direction TB
        C1["기존 커넥션 A 사용"] -->|"maxLifetime 만료"| C2["커넥션 Graceful Close"]
        C2 -->|"비동기 신규 수립 요청"| C3["새 커넥션 생성"]
    end

    subgraph ScanRouting["SCAN 로드밸런싱 개입"]
        direction TB
        SCAN2["SCAN Listener<br/>(부하 판별)"]
    end

    subgraph RACCluster["균등 분산된 RAC 2-Node"]
        direction TB
        N1["Node 1 (45%)<br/>기존 작업 수행"]
        N2["Node 2 (40%)<br/><b>신규 세션 수신</b>"]
    end

    C3 ==> SCAN2
    SCAN2 -->|"부하 낮은 노드로 재할당"| N2
    C1 -.-> N1

    classDef pool fill:#E1F5FE,stroke:#0288D1,stroke-width:1.2px,color:#01579B;
    classDef scan fill:#FFF9C4,stroke:#FBC02D,stroke-width:1.5px,color:#5D4037;
    classDef balanced fill:#E8F5E9,stroke:#4CAF50,stroke-width:1.5px,color:#1B5E20;

    class C1,C2,C3 pool;
    class SCAN2 scan;
    class N1,N2 balanced;

    style PoolCycle fill:#FAFAFA,stroke:#90CAF9,stroke-width:1.5px,stroke-dasharray: 6 4
    style ScanRouting fill:#FFFFFF,stroke:#BDBDBD,stroke-width:1.2px
    style RACCluster fill:#FAFAFA,stroke:#81C784,stroke-width:1.5px,stroke-dasharray: 6 4
```
<p align="center"><em>Figure 2: maxLifetime 단축을 통한 커넥션 주기적 교체 및 노드 로드밸런싱 복원</em></p>

### 3.1. 파라미터 튜닝: 30분에서 30초~1분으로의 단축
HikariCP의 `maxLifetime` 기본 권장값은 30분(`1,800,000ms`)이다. 일반적인 단일 DB 인스턴스 환경에서는 핸드셰이크 비용을 아끼기 위해 긴 수명을 유지하는 것이 일반적이다.  
그러나 다중 노드 분산이 필수적인 배치 환경에서는 이 값을 **30초(`30000ms`)에서 1분(`60000ms`)** 수준으로 대폭 단축했다.

```yaml
spring:
  datasource:
    hikari:
      pool-name: BatchHikariPool
      maximum-pool-size: 10
      minimum-idle: 5
      # RAC 노드 분산을 위해 커넥션 순환 주기 단축 (기본 30분 -> 1분)
      max-lifetime: 60000
      # 유휴 커넥션 정리 시간
      idle-timeout: 30000
      connection-timeout: 10000
```

- 커넥션이 60초에 도달하면 작업이 끝난 직후 풀에서 안전하게 닫히고 퇴역(Retire)한다.
- 빈자리를 채우기 위해 풀 백그라운드 스레드가 신규 물리 연결을 요청한다.
- 이때 SCAN Listener가 개입하여, 현재 부하가 현저히 낮은 RAC Node 2로 새로운 물리 연결을 맺어준다.
- 작업이 진행되면서 풀 내부의 활성 커넥션들이 Node 1과 Node 2로 자연스럽게 양분된다.

---

## 4. 실측 데이터와 프로덕션 검증

`maxLifetime`을 1분으로 설정한 후 대규모 배치 작업을 재수행하여 시스템 자원과 수행 시간을 정량적으로 측정했다.

### 4.1. 노드별 부하 평준화 및 소요 시간 비교

| 측정 지표 | 튜닝 전 (기본 maxLifetime 30분) | 튜닝 후 (maxLifetime 60초) | 개선 성과 |
| :--- | :--- | :--- | :--- |
| **RAC Node 1 CPU** | **83% (피크 임계치 초과)** | **45% (안정권)** | **피크 CPU 약 45% 감소** |
| **RAC Node 2 CPU** | **6% (유휴 방치)** | **40% (균등 분산)** | **양 노드 연산 자원 완전 활용** |
| **전체 클러스터 CPU 합계** | 약 89% | 약 85% | 불필요한 OS 경합 완화로 총 소모 감소 |
| **배치 총 소요 시간** | **9분 40초 (580초)** | **7분 15초 (435초)** | **수행 시간 25% 단축** |

단일 노드의 CPU가 80%를 넘어서면서 발생했던 프로세스 스케줄링 큐 적체가 해소되고, 2개 노드의 CPU 코어를 온전히 병렬로 활용하게 되면서 전체 배치 수행 시간이 **25% 단축**되었다.

---

## 5. 트레이드오프와 우려 사항 검증: 핸드셰이크와 Cache Fusion

커넥션을 주기적으로 끊고 다시 맺는 전략을 취할 때, 엔지니어링 관점에서 반드시 짚고 넘어가야 할 두 가지 잠재적 부작용이 있었다.

```mermaid
flowchart LR
    subgraph Cost["잠재적 오버헤드 (비용)"]
        direction TB
        C_TCP["TCP + PGA 생성 비용<br/>(10분간 세션당 6~7회 수립)"]
        C_GC["RAC Cache Fusion 전송<br/>(gc buffer busy / Interconnect)"]
    end

    subgraph Benefit["확보된 아키텍처 이점 (이득)"]
        direction TB
        B_CPU["물리 코어 2배 활용<br/>(피크 CPU 83% → 45% 안정화)"]
        B_Time["배치 수행 시간 25% 단축<br/>(OS 스케줄링 큐 병목 해소)"]
    end

    Cost ==>|"이득이 비용을 압도함"| Benefit

    classDef costStyle fill:#FFEBEE,stroke:#E53935,stroke-width:1.2px,color:#B71C1C;
    classDef benefitStyle fill:#E8F5E9,stroke:#4CAF50,stroke-width:1.5px,color:#1B5E20;

    class C_TCP,C_GC costStyle;
    class B_CPU,B_Time benefitStyle;

    style Cost fill:#FAFAFA,stroke:#E57373,stroke-width:1.5px,stroke-dasharray: 6 4
    style Benefit fill:#FAFAFA,stroke:#81C784,stroke-width:1.5px,stroke-dasharray: 6 4
```
<p align="center"><em>Figure 3: 주기적 커넥션 회전 도입 시 트레이드오프(비용 vs 이득) 분석</em></p>

### 5.1. TCP Handshake 및 프로세스 생성 오버헤드는 유의미한가?
- **우려**: 물리 커넥션을 맺을 때 TCP 3-way Handshake와 Oracle Dedicated Server Process 생성, PGA 메모리 할당이 수반된다.
- **실측 검증**:
  - 배치 평균 총 수행 시간은 약 10분(600초)이다.
  - `maxLifetime`을 60초로 두었을 때, 단일 커넥션 기준으로 10분 동안 발생하는 신규 연결 수립 횟수는 **고작 6~7회**에 불과하다.
  - 풀 전체가 10개 커넥션이라 하더라도 10분 동안 클러스터 전체에서 발생한 신규 접속은 60~70회 안팎이다.
  - 초당 수백 회씩 커넥션을 맺고 끊는 Connection Churn 상태가 아니며, 유휴 시간에 백그라운드로 안전하게 교체되므로 CPU 오버헤드는 측정 불가능할 정도로 미미했다.

### 5.2. RAC Cache Fusion 경합(`gc buffer busy`)의 영향도
- **우려**: 양쪽 노드에서 동일 테이블이나 인덱스 블록을 동시에 수정할 경우, 노드 간 고속 사설망(Private Interconnect)을 통해 데이터 블록을 주고받는 Cache Fusion 동기화 비용과 `gc buffer busy acquire` 대기 이벤트가 증가할 수 있다.
- **실측 검증**:
  - AWR 리포트 분석 결과, 노드 분산 이후 실제로 `gc current block 2-way` 및 `gc buffer busy` 대기 횟수가 소폭 상승했다.
  - 그러나 현대 엔터프라이즈 RAC의 Interconnect는 100Gbps 고속 네트워크 기반이며, 블록 전송은 디스크가 아닌 **인메모리(In-Memory) 전송**으로 처리된다. 이 지연 시간은 수 마이크로초에서 1~2밀리초 수준이다.
  - 반면 단일 노드 CPU가 80%를 초과하여 발생했던 스레드 락 경합 및 OS 런큐(Run Queue) 지연 시간은 수십~수백 밀리초에 달했다.
  - 즉, **미세한 메모리 레벨의 Cache Fusion 비용을 지불하고, 거대한 물리 CPU 코어 연산 자원을 확보하는 전략적 선택**이 압도적인 성능 향상을 이끌어냈다.

---

## 6. 회고 및 운영 적용 시 주의점

Oracle RAC와 범용 커넥션 풀을 조합할 때 최적의 성능을 끌어내기 위한 엔지니어링 교훈은 다음과 같다.

1. **OLTP 풀과 배치 풀의 분리 (DataSource Separation)**:  
   초당 수만 TPS가 인입되는 온라인 웹 API(OLTP) 풀에는 `maxLifetime`을 30초~1분으로 극단적으로 낮추면 안 된다. 동시 사용자 수가 많은 서비스에서는 순간적인 연결 재생성 폭증으로 Listener 병목이 발생할 수 있다.  
   단기 대량 처리가 목적인 배치 애플리케이션에 한해 독립된 DataSource를 구성하고 짧은 `maxLifetime`을 부여해야 한다.
2. **Oracle RAC Service(서비스명) 분리 병행**:  
   단순 SCAN 분산에만 의존하지 않고, `srvctl add service`를 통해 배치 전용 RAC Service(`BATCH_SVC`)를 별도로 등록하여 기본 인스턴스 우선순위를 제어하는 아키텍처적 조치를 병행하면 더욱 안정적인 자원 격리가 가능하다.
3. **인프라 스케일업 전 아키텍처 점검**:  
   클러스터 환경에서 단일 노드 자원 포화가 관측될 때, 하드웨어 증설을 결정하기 전 노드 간 트래픽이 실제로 어떻게 흐르고 있는지(물리 세션 결합 여부)를 먼저 프로파일링해야 한다.
