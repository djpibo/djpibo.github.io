---
id: bulk-insert-batching-and-oracle-verification
title: "Spring에서는 실제로 bulk insert 처리를 하는지? Oracle 트레이스 로그로 확인하는 방법"
sidebar_label: Spring Bulk Insert & Oracle Trace
sidebar_position: 6
date: "2026년 9월 12일"
reading_time: "약 12분"
---

# Spring에서는 실제로 bulk insert 처리를 하는지? Oracle 트레이스 로그로 확인하는 방법

대량 데이터를 데이터베이스에 적재하는 배치나 마이그레이션 작업을 구현할 때, 애플리케이션 코드에서는 보통 리스트나 컬렉션 단위로 데이터를 묶어서 넘긴다.  
Spring Data JPA의 `saveAll()`, MyBatis의 `<foreach>` 또는 `ExecutorType.BATCH`, JDBC의 `addBatch()`를 사용하면서 "DB 엔진에 일괄(Bulk)로 전달되어 한 번에 커밋될 것"이라고 기대하는 편이다.

하지만 실제 오라클(Oracle) 데이터베이스의 세션 통계나 SQL 트레이스를 확인해보면 기대와 전혀 다른 현상이 빈번하게 확인된다.  
10만 건의 데이터를 리스트로 넘겼음에도 오라클 엔진은 10만 번의 개별 INSERT Call을 처리하느라 네트워크 패킷을 10만 번 주고받거나, 심지어 행마다 개별 커밋(Commit)이 발생해 `log file sync` 대기 이벤트로 시스템 전체 I/O를 점유하기도 한다.

애플리케이션 계층의 '배치 코드'와 오라클 DB 엔진 내부의 '물리적 실행' 사이에 왜 이러한 괴리가 발생하는지, 그리고 이를 10046 Extended Trace와 딕셔너리 뷰를 통해 테이블 단위로 검증하는 방법을 정리한다.

---

## 1. 프레임워크별 동작 메커니즘과 내부 함정

애플리케이션 개발자가 작성하는 메서드 호출과 JDBC 드라이버가 오라클 Net8 프로토콜을 통해 전송하는 물리적 패킷 사이에는 상당한 변환 계층이 존재한다.

```mermaid
flowchart TD
    subgraph AppLayer["애플리케이션 계층"]
        A1["Spring Data JPA: saveAll(list)"]
        A2["MyBatis: foreach / ExecutorType.BATCH"]
        A3["JDBC: PreparedStatement.addBatch()"]
    end

    subgraph DriverLayer["Oracle JDBC Thin Driver"]
        D1["단건 전송 (Single Execution Loop)"]
        D2["Array Processing (배열 바인딩 일괄 전송)"]
    end

    subgraph DBEngine["Oracle 19c Engine"]
        E1["EXEC Call 10,000회 / r=1 / Roundtrip 10,000회"]
        E2["EXEC Call 10회 / r=1000 / Roundtrip 10회"]
    end

    A1 -.->|"IDENTITY 매핑 시"| D1
    A1 -.->|"SEQUENCE + batch_size"| D2
    A2 -.->|"foreach 다중 구문"| D1
    A2 -.->|"BATCH Executor"| D2
    A3 --> D2
    D1 --> E1
    D2 --> E2
```

### 1.1. Spring Data JPA: `GenerationType.IDENTITY`가 배칭을 무력화하는 원리
Spring Data JPA의 `SimpleJpaRepository.saveAll()` 메서드를 열어보면 내부는 단순히 리스트를 순회하며 `save()`를 호출하는 루프로 구성되어 있다.

```java
@Transactional
@Override
public <S extends T> List<S> saveAll(Iterable<S> entities) {
    List<S> result = new ArrayList<>();
    for (S entity : entities) {
        result.add(save(entity));
    }
    return result;
}
```

JPA의 배치 처리는 영속성 컨텍스트의 **쓰기 지연(Write-Behind)** 저장소에 INSERT 쿼리를 모아두었다가, 트랜잭션 커밋 직전 `flush()` 시점에 `hibernate.jdbc.batch_size` 설정에 맞춰 JDBC `executeBatch()`로 전달하는 원리로 동작한다.

여기서 가장 흔하게 발생하는 함정은 PK 채번 전략이다.
- **`GenerationType.IDENTITY`**: Oracle 12c부터 지원하는 `GENERATED AS IDENTITY` 컬럼을 매핑한 경우, 엔티티가 영속(Persistent) 상태가 되려면 1차 캐시의 식별자(ID) 값이 반드시 필요하다. 하지만 IDENTITY 전략은 DB에 실제 INSERT를 실행하기 전까지 ID 값을 알 수 없다. 따라서 하이버네이트는 **쓰기 지연을 강제로 비활성화**하고, `persist()` 호출 시점에 즉시 단건 INSERT 쿼리를 DB로 전송한다. 결과적으로 `hibernate.jdbc.batch_size` 설정은 완전히 무시된다.
- **`GenerationType.SEQUENCE`**: 오라클 시퀀스를 사용하면 DB에 INSERT를 던지기 전에 시퀀스 값을 먼저 조회해와 엔티티에 세팅할 수 있으므로 쓰기 지연 배칭이 정상 동작한다. 단, 시퀀스의 `allocationSize`와 하이버네이트 설정(`hibernate.id.new_generator_mappings`, `order_inserts=true`)을 일치시키지 않으면 시퀀스 채번을 위해 수만 번의 `SELECT ... NEXTVAL` 라운드트립이 선행되는 문제가 발생한다.

### 1.2. MyBatis: `<foreach>` 다중 행 구문의 한계 vs `ExecutorType.BATCH`
MyBatis 환경에서 대량 INSERT를 구현할 때 가장 흔히 시도하는 방식이 XML 동적 태그인 `<foreach>`다.

오라클은 MySQL과 달리 단일 구문 내 `INSERT INTO table VALUES (...), (...)` 형태의 다중 행 INSERT 문법을 지원하지 않는다(Oracle 23ai 이전 버전 기준).  
따라서 XML 내에서 다음과 같은 편법 구문을 작성하는 경우가 많다.

```xml
<!-- [비권장] INSERT ALL을 이용한 다중 행 생성 -->
<insert id="insertBulkOrders">
    INSERT ALL
    <foreach collection="list" item="item">
        INTO tb_order_item (item_id, item_name, qty, price)
        VALUES (#{item.itemId}, #{item.itemName}, #{item.qty}, #{item.price})
    </foreach>
    SELECT * FROM dual
</insert>
```

이 방식은 다음과 같은 물리적 한계를 가진다:
1. **바인드 변수 한도 초과**: 오라클의 최대 바인드 파라미터 개수는 65,535개다. 컬럼이 10개인 테이블이라면 한 번에 6,500건 이상을 넣는 순간 `ORA-01745: invalid host/bind variable name` 또는 `ORA-01000` 에러가 발생한다.
2. **라이브러리 캐시 래치 경합 및 하드 파싱**: 전달되는 리스트 크기에 따라 매번 SQL 텍스트의 길이가 달라지고 바인드 변수 개수가 달라진다. 이는 매번 새로운 SQL로 인식되어 하드 파싱(Hard Parse)을 유발하고, Shared Pool의 래치 경합(`library cache: mutex X`)을 초래한다.

MyBatis에서 오라클의 네이티브 배칭을 활용하는 올바른 방법은 단건 INSERT XML 구문을 정의해두고, `SqlSessionTemplate`을 `ExecutorType.BATCH` 모드로 실행하는 것이다.

```java
// 동일 Statement를 재사용하며 JDBC Array Batch로 전송하는 패턴
SqlSession sqlSession = sqlSessionFactory.openSession(ExecutorType.BATCH, false);
try {
    OrderMapper mapper = sqlSession.getMapper(OrderMapper.class);
    for (int i = 0; i < orderList.size(); i++) {
        mapper.insertOrderItem(orderList.get(i));
        if (i > 0 && i % 1000 == 0) {
            sqlSession.flushStatements(); // 1,000건 단위로 드라이버 버퍼 방출
        }
    }
    sqlSession.flushStatements();
    sqlSession.commit();
} finally {
    sqlSession.close();
}
```

### 1.3. JDBC: PreparedStatement의 Native Array Processing
JDBC 레벨의 `PreparedStatement.addBatch()`와 `executeBatch()`는 가장 직접적으로 오라클 드라이버의 **Array Processing** 기능을 호출한다.

동일한 SQL 텍스트를 단 1회 파싱한 뒤, 드라이버 메모리 버퍼에 바인드 변수 값들을 2차원 배열 형태로 채운다. 이후 `executeBatch()`가 호출되는 시점에 Net8 프로토콜의 SDU(Session Data Unit) 패킷에 바인드 배열을 압축 적재하여 전송하므로 네트워크 왕복 횟수를 획기적으로 줄인다.

### 1.4. Commit 발생 단위: 트랜잭션 경계와 `log file sync`
배치 작업의 속도를 결정짓는 또 하나의 축은 **커밋의 빈도**다.

- **정상적인 트랜잭션 경계**: `@Transactional`이 전체 작업 외부에 선언되어 있거나, 수동 트랜잭션에서 루프가 끝난 뒤 1회 `commit()`을 호출하면, 10만 건의 INSERT가 단건으로 실행되었든 배치로 실행되었든 오라클 레벨의 `user commits`는 **단 1회**만 발생한다.
- **루프 내부 Commit 또는 AutoCommit**: 루프 안에서 개별 메서드를 호출하면서 신규 트랜잭션(`REQUIRES_NEW`)이 열리거나, Connection이 `autoCommit(true)` 상태라면 매 INSERT마다 커밋이 발생한다.
  - 오라클은 커밋 요청을 받는 즉시 LGWR(Log Writer)가 Redo Log Buffer의 내용을 디스크의 온라인 리두 로그 파일로 기록할 때까지 해당 세션을 대기시킨다.
  - 이 대기 이벤트가 바로 `log file sync`다.
  - 디스크 I/O 레이턴시가 1ms라고 가정할 때, 10만 번 커밋하면 순수 커밋 대기 시간만으로 100,000회 × 1ms = 약 100초가 소요된다.

---

## 2. 10046 Extended SQL Trace로 파헤치는 단건(r=1) vs 배치(r=1000) 물리적 차이

실제로 데이터가 어떻게 처리되고 있는지 오라클 엔진 수준에서 가장 확실하게 확인하는 방법은 **10046 Extended SQL Trace**를 확인하는 것이다.

### 2.1. 10046 Trace의 개념 및 진단 레벨
10046 이벤트는 오라클이 내부적으로 제공하는 확장 SQL 트레이스 이벤트다. 표준 SQL 트레이스(`SQL_TRACE=TRUE`)가 쿼리의 파싱, 실행, 페치 횟수와 CPU/I/O 총량만 기록하는 반면, 10046 이벤트는 **바인드 변수 실측값**과 **대기 이벤트(Wait Event)**를 마이크로초 단위로 기록한다.

| 진단 레벨 | 수집 내용 | 용도 |
| :--- | :--- | :--- |
| **Level 1** | 표준 SQL Trace (Parse/Execute/Fetch 통계, 처리 행 수) | 기본 실행 통계 확인 |
| **Level 4** | Level 1 + **바인드 변수 값 (Bind Variables)** | 바인드 파라미터 확인 |
| **Level 8** | Level 1 + **대기 이벤트 (Wait Events 및 대기 시간)** | I/O 및 락 병목 분석 |
| **Level 12** | Level 1 + Level 4 + Level 8 (바인드 변수 + 대기 이벤트 모두 수집) | **실무 표준 트레이스** |

### 2.2. 트레이스 활성화 및 수집 방법

#### 현재 세션에서 활성화 (단위 테스트 또는 테스트 쿼리)
```sql
-- 현대식 권장 방식 (DBMS_MONITOR 패키지)
EXEC DBMS_MONITOR.SESSION_TRACE_ENABLE(waits => TRUE, binds => TRUE);

-- 또는 전통적인 ALTER SESSION 방식 (Level 12)
ALTER SESSION SET EVENTS '10046 trace name context forever, level 12';

-- [배치 작업 실행]

-- 트레이스 종료
EXEC DBMS_MONITOR.SESSION_TRACE_DISABLE();
-- 또는
ALTER SESSION SET EVENTS '10046 trace name context off';
```

#### 타깃 WAS 세션(다른 세션) 추적 및 트레이스 활성화
실무 환경에서는 개발자 본인의 SQL 클라이언트 세션보다, Spring WAS(HikariCP)나 배치 서버가 맺고 있는 **다른 세션**을 대상으로 10046 트레이스를 걸어야 하는 경우가 대부분이다. 오라클은 관리자(DBA) 세션에서 다른 활성 세션을 지정해 10046 트레이스를 켜고 끌 수 있는 메커니즘을 제공한다.

##### 1) `DBMS_MONITOR` 패키지 사용 (표준 권장 방식)
대상 애플리케이션 세션의 `SID`와 `SERIAL#`를 `V$SESSION`에서 조회한 뒤 원격으로 활성화한다.

```sql
-- 1. 대상 배치 세션 확인 (예: 프로그램명이나 모듈명으로 탐색)
SELECT sid, serial#, username, osuser, program, module, status
FROM v$session
WHERE program LIKE '%java%' OR module LIKE '%Order%';

-- 2. 대상 세션(SID: 142, SERIAL#: 38192)에 10046 Trace (Level 12) 활성화
EXEC DBMS_MONITOR.SESSION_TRACE_ENABLE(session_id => 142, serial_num => 38192, waits => TRUE, binds => TRUE);

-- 3. 배치 작업 실행 확인 후 트레이스 비활성화
EXEC DBMS_MONITOR.SESSION_TRACE_DISABLE(session_id => 142, serial_num => 38192);
```

##### 2) HikariCP 커넥션 풀 환경: 모듈 또는 클라이언트 식별자 단위 추적
WAS의 커넥션 풀 환경에서는 작업이 어떤 세션(SID)으로 진입할지 사전에 특정하기 어려운 경우가 많다. 이 경우 세션 ID 대신 Spring에서 부여한 모듈명이나 클라이언트 식별자 단위로 트레이스를 걸 수 있다.

```sql
-- Spring 코드 또는 커넥션 초기화 시 client_identifier를 설정한 경우
-- 예: connection.setClientInfo("OCID_CLIENT_IDENTIFIER", "ORDER_BATCH_01");
EXEC DBMS_MONITOR.CLIENT_ID_TRACE_ENABLE(client_id => 'ORDER_BATCH_01', waits => TRUE, binds => TRUE);

-- 또는 Service / Module / Action 단위로 추적
EXEC DBMS_MONITOR.SERV_MOD_ACT_TRACE_ENABLE(service_name => 'APP_SVC', module_name => 'OrderBatchService', waits => TRUE, binds => TRUE);
```

##### 3) `ORADEBUG` 유틸리티 사용 (SYSDBA 전용)
SYSDBA 권한이 있는 경우 오라클 프로세스 레벨에서 직접 10046 이벤트를 주입할 수 있다.

```sql
-- 대상 세션의 오라클 SPID 또는 OS PID 지정
ORADEBUG SETORAPID 142; -- 오라클 세션 SID 지정
-- 또는
ORADEBUG SETOSPID 28419; -- OS 프로세스 ID(SPID) 지정

-- 10046 Level 12 활성화
ORADEBUG EVENT 10046 TRACE NAME CONTEXT FOREVER, LEVEL 12;

-- 비활성화
ORADEBUG EVENT 10046 TRACE NAME CONTEXT OFF;
```

---

#### 다른 세션의 트레이스 파일 물리 경로 확인 방법
현재 세션에서는 `SELECT value FROM v$diag_info WHERE name = 'Default Trace File';` 구문으로 바로 경로를 찾을 수 있지만, **다른 세션의 트레이스 파일은 해당 뷰에 나오지 않는다.**

트레이스 파일은 DB 서버(OS)의 백그라운드 Dedicated Server Process에 의해 기록되므로, `V$SESSION`과 `V$PROCESS`를 조인하여 **대상 세션의 서버 프로세스(`p.tracefile`)를 조회**해야 실제 파일 위치를 정확하게 찾아낼 수 있다.

```sql
SELECT 
    s.sid,
    s.serial#,
    s.username,
    s.program,
    s.module,
    p.spid AS os_pid,
    p.tracefile AS target_trace_file
FROM v$session s
JOIN v$process p ON s.paddr = p.addr
WHERE s.sid = :target_sid; -- 추적 대상 세션의 SID
```

출력 결과 예시:
```text
SID  SERIAL#  PROGRAM              OS_PID   TARGET_TRACE_FILE
---  -------  -------------------  -------  -------------------------------------------------------------
142    38192  JDBC Thin Client     28419    /u01/app/oracle/diag/rdbms/orcl/orcl/trace/orcl_ora_28419.trc
```

조회된 `TARGET_TRACE_FILE` 경로의 `.trc` 파일을 DB 서버 OS에서 열어보거나, `tkprof` 유틸리티를 실행해 분석한다.
```bash
tkprof /u01/app/oracle/diag/rdbms/orcl/orcl/trace/orcl_ora_28419.trc ./batch_report.txt sys=no sort=prsela,exeela,fchela
```

---

### 2.3. 원시 트레이스(Raw Trace) 라인 비교

생성된 `.trc` 파일의 내부 텍스트 라인을 열어보면 단건 처리와 배치 처리의 차이가 명확하게 드러난다.

#### 단건 처리 로그: 1만 건 반복 실행 (`r=1`)
```text
-- 1번째 행 실행
BINDS #140239120:
 bind 0: dty=2 mxl=22(22) mal=00 scl=00 pre=00 oacflg=03 cobflg=00 val=10001
 bind 1: dty=1 mxl=32(04) mal=00 scl=00 pre=00 oacflg=03 cobflg=00 val="ITEM_A"
EXEC #140239120:c=0,e=25,p=0,cr=1,cu=3,mis=0,r=1,dep=0,og=1,plh=31245,tim=17261424001000
WAIT #140239120: nam='SQL*Net message to client' ela= 1 driver id=1413697536 #bytes=1 p3=0
WAIT #140239120: nam='SQL*Net message from client' ela= 180 driver id=1413697536 #bytes=1 p3=0

-- 2번째 행 실행
BINDS #140239120:
 bind 0: dty=2 mxl=22(22) mal=00 scl=00 pre=00 oacflg=03 cobflg=00 val=10002
 bind 1: dty=1 mxl=32(04) mal=00 scl=00 pre=00 oacflg=03 cobflg=00 val="ITEM_B"
EXEC #140239120:c=0,e=23,p=0,cr=1,cu=3,mis=0,r=1,dep=0,og=1,plh=31245,tim=17261424001210
WAIT #140239120: nam='SQL*Net message to client' ela= 1 driver id=1413697536 #bytes=1 p3=0
WAIT #140239120: nam='SQL*Net message from client' ela= 175 driver id=1413697536 #bytes=1 p3=0

... (동일한 블록이 10,000번 반복 기록됨) ...
```

#### 배치 처리 로그: 1,000건 단위 Array Processing (`r=1000`)
```text
-- 1번째 배치 실행 (1,000건 바인드 배열 전송)
BINDS #140239120:
 Array Bind: 1000 elements processed
 bind 0: dty=2 mxl=22(22) mal=1000 ...
 bind 1: dty=1 mxl=32(32) mal=1000 ...
EXEC #140239120:c=8000,e=9500,p=0,cr=5,cu=102,mis=0,r=1000,dep=0,og=1,plh=31245,tim=17261424002500
WAIT #140239120: nam='SQL*Net message to client' ela= 1 driver id=1413697536 #bytes=1 p3=0
WAIT #140239120: nam='SQL*Net message from client' ela= 220 driver id=1413697536 #bytes=1 p3=0

... (1만 건 처리 시 EXEC 라인이 단 10번만 찍히고 종료) ...
```

### 2.4. 내부 물리 동작의 본질적 차이

| 물리 지표 | 단건 처리 (`r=1`) | 배치 처리 (`r=1000`) | 동작 원리 차이 |
| :--- | :--- | :--- | :--- |
| **EXEC Call 수** | 10,000회 | 10회 | OCI/Net8 드라이버 패킷 전송 및 Context Switching 횟수 |
| **네트워크 대기** | `SQL*Net ... from client` 10,000회 | `SQL*Net ... from client` 10회 | 네트워크 라운드트립 지연 시간이 누적되지 않음 |
| **버퍼 블록 핀(Pin)** | 1건마다 핀 획득 $\rightarrow$ 해제 반복 | 블록 핀 유지 상태에서 연속 삽입 | `cache buffers chains` 래치 경합 급감 |
| **Current Gets (`cu`)** | 30,000 ~ 40,000회 | 1,000 ~ 1,500회 | 블록 헤더 ITL(Interested Transaction List) 갱신 비용 절감 |
| **Redo Vector 생성** | 행 단위 Redo 레코드 체이닝 | 다중 행 변경 벡터를 단일 Redo 레코드로 패키징 | Redo Log 버퍼 경합 완화 |

특히 중요한 점은 **데이터 블록 핀(Pin) 유지 메커니즘**이다.  
단건(`r=1`)으로 처리하면 오라클 엔진은 매 레코드마다 테이블 세그먼트의 타깃 블록을 버퍼 캐시에서 찾아 핀을 꽂고 행을 쓴 뒤 즉시 언핀(Unpin)한다. 다음 행이 물리적으로 동일한 블록에 저장되더라도 매번 해시 버킷 래치를 얻고 푸는 과정을 반복해야 한다.  
반면 Array Processing(`r=1000`)에서는 타깃 블록에 핀을 꽂은 채 블록의 여유 공간(Free Space)이 허용하는 한 여러 레코드를 연속해서 밀어 넣는다. 그 결과 Current Mode I/O를 나타내는 `cu` 지표가 20분의 1 수준으로 감소한다.

---

### 2.5. Trace 로그로 확인하는 Commit 시점 (`XCTEND`)

10046 Trace 파일에서 트랜잭션의 종료(커밋 또는 롤백)는 `XCTEND` 마커로 기록된다.

#### 케이스 A: 1건마다 Commit이 발생하는 로그
```text
EXEC #... r=1 ...
WAIT #... nam='log file sync' ela= 1120 buffer#=120 p3=0
XCTEND r=0, rd=0, shake=0, flag=2
WAIT #... nam='SQL*Net message to client' ela= 1 ...
WAIT #... nam='SQL*Net message from client' ela= 150 ...
EXEC #... r=1 ...
WAIT #... nam='log file sync' ela= 1080 buffer#=121 p3=0
XCTEND r=0, rd=0, shake=0, flag=2
```
매 `EXEC` 직후 LGWR가 Redo Log File에 기록할 때까지 세션이 대기하는 `log file sync`가 발생하고 즉시 `XCTEND`가 기록된다. 전체 소요 시간 중 대부분이 `log file sync` 대기 시간으로 채워진다.

#### 케이스 B: 1만 건 작업 후 마지막 1회 Commit 로그
```text
EXEC #... r=1000 ...
EXEC #... r=1000 ...
... (10회의 EXEC 동안 XCTEND와 log file sync가 전혀 나타나지 않음) ...
WAIT #... nam='log file sync' ela= 2100 buffer#=150 p3=0
XCTEND r=0, rd=0, shake=0, flag=2
```
1만 건이 모두 적재될 때까지 메모리(버퍼 캐시 및 언두 블록) 상에서만 트랜잭션이 유지되며, 작업이 끝난 뒤 단 1번의 `log file sync`와 `XCTEND`가 찍힌다.

---

## 3. 테이블 단위로 실시간 및 과거 커밋 실측치를 검증하는 방법

### 3.1. 실시간 검증 1: `V$SQL` (테이블 기준 `rows_per_exec`)
메모리(라이브러리 캐시)에 적재된 SQL 통계를 확인하여, 특정 테이블로 들어간 INSERT 구문이 1회 실행당 몇 행씩 처리되었는지를 확인한다.

```sql
SELECT 
    sql_id,
    plan_hash_value,
    executions,
    rows_processed,
    -- 1회 실행당 처리된 행 수 (핵심 지표)
    ROUND(rows_processed / NULLIF(executions, 0), 2) AS rows_per_exec,
    parse_calls,
    buffer_gets,
    ROUND(buffer_gets / NULLIF(rows_processed, 0), 2) AS buffers_per_row,
    ROUND(elapsed_time / 1000000, 2) AS elapsed_sec,
    sql_text
FROM v$sql
WHERE UPPER(sql_text) LIKE '%INSERT%TB_ORDER_ITEM%'
  AND UPPER(sql_text) NOT LIKE '%V$SQL%'
ORDER BY last_active_time DESC;
```

- **실측 해석**:
  - `EXECUTIONS = 10,000`, `ROWS_PROCESSED = 10,000` $\rightarrow$ `rows_per_exec = 1.00`: 애플리케이션 코드가 어떻게 작성되었든 오라클은 **1만 번 단건 실행**한 상태다.
  - `EXECUTIONS = 10`, `ROWS_PROCESSED = 10,000` $\rightarrow$ `rows_per_exec = 1000.00`: **1,000건 단위 Array Batch**로 정상 처리된 상태다.

---

### 3.2. 실시간 검증 2: `V$SESSTAT` (세션 기준 `user commits` & Roundtrips)
커밋이 1건마다 발생했는지, 트랜잭션 종료 시 1번만 발생했는지는 세션 통계에서 확인한다.

```sql
SELECT 
    s.sid,
    n.name,
    s.value
FROM v$sesstat s
JOIN v$statname n ON s.statistic# = n.statistic#
WHERE s.sid = :target_sid  -- 배치 수행 세션 SID
  AND n.name IN (
      'execute count',
      'user commits',
      'user rollbacks',
      'SQL*Net roundtrips to/from client',
      'bytes sent via SQL*Net to client',
      'redo entries',
      'redo size'
  );
```

- **실측 해석**:
  - 1만 건 처리 후 `user commits = 1` $\rightarrow$ 단일 트랜잭션 정상 커밋.
  - `user commits = 10,000` $\rightarrow$ 행마다 개별 커밋 발생.
  - `SQL*Net roundtrips to/from client`가 10,000 이상이면 네트워크 왕복이 병목을 유발하고 있음을 의미한다.

---

### 3.3. 실시간 검증 3: `V$LOCKED_OBJECT` + `V$TRANSACTION` (실시간 Undo 증가량 추적)
배치 작업이 진행 중일 때 타깃 테이블에 걸린 트랜잭션의 누적 반영 레코드 수를 실시간으로 확인한다.

```sql
SELECT 
    lo.session_id,
    o.owner,
    o.object_name,
    t.xidusn,
    t.xidslot,
    t.status,
    t.start_time,
    t.used_ublk,  -- 할당된 Undo 블록 수
    t.used_urec   -- 현재 트랜잭션에 기록된 Undo 레코드 수 (누적 변경 건수)
FROM v$locked_object lo
JOIN dba_objects o 
  ON lo.object_id = o.object_id
JOIN v$transaction t 
  ON lo.xidusn = t.xidusn 
 AND lo.xidslot = t.xidslot 
 AND lo.xidsqn = t.xidsqn
WHERE o.object_name = 'TB_ORDER_ITEM';
```

- **실측 해석**:
  - 조회를 반복할 때 동일한 트랜잭션 슬롯(`xidusn`, `xidslot`)이 유지되면서 `used_urec`가 100, 500, 1000, 5000으로 지속 증가한다면 하나의 트랜잭션 내에서 모아서 처리 중인 상태다.
  - 반면 조회를 할 때마다 트랜잭션 슬롯 번호가 바뀌거나 `used_urec`가 1로만 리셋된다면 건건이 커밋하며 트랜잭션을 닫고 새로 여는 상태다.

---

### 3.4. 과거 이력 검증: `DBA_` 딕셔너리 뷰를 통한 사후 실측

이미 배치가 종료되어 인메모리 뷰(`V$SQL`, `V$SESSTAT`)에서 데이터가 밀려난 경우, AWR 딕셔너리와 플래시백 뷰를 통해 과거 시점의 동작을 역추적할 수 있다.

#### 1) `DBA_HIST_SQLSTAT`: 과거 특정 SQL_ID의 1회당 행 수(`rows_per_exec`)
특정 일자, 특정 시간대 스냅샷 구간에 수행된 INSERT SQL의 실행 횟수 대비 처리 행 수 비율을 확인한다.

```sql
SELECT 
    sn.snap_id,
    TO_CHAR(sn.begin_interval_time, 'YYYY-MM-DD HH24:MI') AS begin_time,
    h.sql_id,
    h.plan_hash_value,
    h.executions_delta,
    h.rows_processed_delta,
    -- 과거 실행 당시 1회 Call당 처리된 평균 행 수
    ROUND(h.rows_processed_delta / NULLIF(h.executions_delta, 0), 2) AS rows_per_exec,
    h.buffer_gets_delta,
    ROUND(h.buffer_gets_delta / NULLIF(h.rows_processed_delta, 0), 2) AS buffers_per_row,
    ROUND(h.elapsed_time_delta / 1000000, 2) AS elapsed_sec
FROM dba_hist_sqlstat h
JOIN dba_hist_snapshot sn 
  ON h.snap_id = sn.snap_id 
 AND h.instance_number = sn.instance_number
WHERE h.sql_id = :target_sql_id
  AND sn.begin_interval_time BETWEEN TO_TIMESTAMP('2026-09-10 02:00:00', 'YYYY-MM-DD HH24:MI:SS')
                                 AND TO_TIMESTAMP('2026-09-10 04:00:00', 'YYYY-MM-DD HH24:MI:SS')
ORDER BY sn.snap_id;
```

#### 2) `DBA_HIST_ACTIVE_SESS_HISTORY` (AWR ASH): 과거 커밋 대기 이벤트 집중도 분석
해당 배치 시간대에 타깃 SQL_ID 또는 모듈에서 `log file sync` 대기가 집중되었는지 확인한다.

```sql
SELECT 
    ash.sql_id,
    ash.session_state,
    ash.event,
    COUNT(*) AS sample_count,
    -- AWR ASH는 10초 주기 샘플링이므로 샘플 수 * 10초로 대략적인 대기 시간 산출
    COUNT(*) * 10 AS est_wait_sec
FROM dba_hist_active_sess_history ash
JOIN dba_hist_snapshot sn 
  ON ash.snap_id = sn.snap_id 
 AND ash.instance_number = sn.instance_number
WHERE sn.begin_interval_time BETWEEN TO_TIMESTAMP('2026-09-10 02:00:00', 'YYYY-MM-DD HH24:MI:SS')
                                 AND TO_TIMESTAMP('2026-09-10 04:00:00', 'YYYY-MM-DD HH24:MI:SS')
  AND (ash.sql_id = :target_sql_id OR ash.event = 'log file sync')
GROUP BY ash.sql_id, ash.session_state, ash.event
ORDER BY sample_count DESC;
```
단건 커밋이 발생했다면 `log file sync` 이벤트가 압도적인 샘플 수로 집계된다.

#### 3) `DBA_HIST_SYSSTAT`: 스냅샷 구간별 시스템 전체 Commit 증분 확인
```sql
SELECT 
    s.snap_id,
    TO_CHAR(sn.begin_interval_time, 'YYYY-MM-DD HH24:MI') AS begin_time,
    s.value - LAG(s.value, 1) OVER (ORDER BY s.snap_id) AS commit_delta
FROM dba_hist_sysstat s
JOIN dba_hist_snapshot sn 
  ON s.snap_id = sn.snap_id 
 AND s.instance_number = sn.instance_number
WHERE s.stat_name = 'user commits'
  AND sn.begin_interval_time BETWEEN TO_TIMESTAMP('2026-09-10 01:00:00', 'YYYY-MM-DD HH24:MI:SS')
                                 AND TO_TIMESTAMP('2026-09-10 05:00:00', 'YYYY-MM-DD HH24:MI:SS')
ORDER BY s.snap_id;
```

#### 4) `FLASHBACK_TRANSACTION_QUERY`: 테이블 단위 과거 트랜잭션별 실제 커밋 이력 추적
오라클의 Undo 보존 기간(`undo_retention`) 내라면, 플래시백 트랜잭션 쿼리를 통해 특정 테이블에 발생한 트랜잭션 XID와 실제 커밋 시각, 처리 건수를 1건 단위로 완벽하게 복원하여 검증할 수 있다.

```sql
SELECT 
    xid,
    commit_scn,
    commit_timestamp,
    operation,
    table_name,
    COUNT(*) AS affected_rows
FROM flashback_transaction_query
WHERE table_name = 'TB_ORDER_ITEM'
  AND commit_timestamp >= TO_TIMESTAMP('2026-09-10 02:00:00', 'YYYY-MM-DD HH24:MI:SS')
  AND operation = 'INSERT'
GROUP BY xid, commit_scn, commit_timestamp, operation, table_name
ORDER BY commit_timestamp DESC;
```

- **실측 해석**:
  - **단일 커밋 증명**: 1개의 `xid`에 대해 `affected_rows = 10,000`이고 1개의 `commit_timestamp`만 출력된다. 1만 건이 단일 트랜잭션으로 커밋되었음을 물리적으로 확증할 수 있다.
  - **건건이 커밋 증명**: 서로 다른 수천~수만 개의 `xid`가 출력되고, 각각 `affected_rows = 1`이며 마이크로초 단위로 분리된 `commit_timestamp`가 찍힌다. 애플리케이션의 트랜잭션 경계 설정 오류를 완벽하게 입증할 수 있다.

---

## 4. 실무 점검 체크리스트

대량 INSERT 작업을 설계하거나 성능 이슈를 분석할 때 다음 체크리스트를 순서대로 확인한다.

| 점검 단계 | 점검 항목 | 정상 기준 | 비정상 시 조치 사항 |
| :--- | :--- | :--- | :--- |
| **JPA 엔티티 설계** | PK 채번 전략 | `GenerationType.SEQUENCE` 사용 | `IDENTITY` 사용 시 쓰기 지연 비활성화됨 $\rightarrow$ Sequence 전환 또는 JDBC Batch 분리 |
| **JPA 프로퍼티** | 배칭 옵션 활성화 | `batch_size: 500~1000`<br/>`order_inserts: true` | 미설정 시 JDBC addBatch 미호출 |
| **MyBatis 매퍼** | 배치 실행 모드 | `ExecutorType.BATCH` 모드 사용 | XML `<foreach>` 기반 다중 인서트 지양 (파싱/바인드 한도 초과 위험) |
| **트랜잭션 경계** | Commit 발생 주기 | 루프 외부 1회 커밋 (`user commits = 1`) | 루프 내 커밋 발생 시 `log file sync` 경합 유발 $\rightarrow$ 트랜잭션 범위 재조정 |
| **오라클 실측 지표** | 실행당 행 수 | `rows_per_exec` $\approx$ `batch_size` | `rows_per_exec = 1`이면 프레임워크 배칭 무력화 상태 확인 |
| **과거 이력 증빙** | 플래시백/AWR 추적 | `FLASHBACK_TRANSACTION_QUERY` 상 XID당 N건 집계 | XID당 1건 집계 시 트랜잭션 누수 증명 |

---

## 5. 마치며

애플리케이션 계층에서 리스트나 컬렉션을 넘기는 코드는 개발 편의성을 위한 추상화일 뿐, 데이터베이스 엔진 수준의 물리적 배칭을 보장하지 않는다.  
특히 JPA의 `IDENTITY` 전략과 하이버네이트 쓰기 지연 메커니즘의 충돌, MyBatis XML `<foreach>`의 파싱 부하 등은 겉으로 드러나지 않는 대표적인 성능 저하 원인이다.

배치 처리 성능에 의문이 생길 때는 로그에 찍히는 단순 실행 시간만 볼 것이 아니라, `10046 Trace`의 `r=` 수치와 `EXEC` 빈도, 그리고 `V$SQL` 및 `FLASHBACK_TRANSACTION_QUERY`의 실측 데이터를 통해 **실제로 DB Call과 Commit이 몇 번 일어났는가**를 직접 검증하는 접근이 필요하다.
