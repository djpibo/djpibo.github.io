---
slug: oracle-sql-workload-event-analysis
title: "Oracle SQL 업무시간 부하 및 이벤트 분석"
date: 2026-09-06
authors: [deejay]
tags: [optimization, troubleshooting]
---

# Oracle SQL 업무시간 부하 및 이벤트 분석

> 분석 기간: 2026-08-01 00:00 ~ 2026-09-05 23:59 / 업무시간: 08:00 ~ 23:59

## 분석 개요

- 원천 지표 행: **8,640건**
- SQL_ID: **286개**
- 평시: **2026-08-01 ~ 2026-08-29 (29일)**
- 이벤트: **2026-08-30 ~ 2026-09-05 (7일)**
- 급증 기준: 이벤트 일평균 호출량이 평시 일평균보다 25% 이상 증가

<!--truncate-->

## 데이터 해석 주의사항

`EXECUTIONS=0`은 결측치가 아니라 1시간 측정 경계를 넘어 실행된 장기 쿼리의 측정 특성일 수 있으므로 원본 값을 유지했다. 평시 전체 호출량 합계가 0이어서 평시 대비 증가율은 0으로 나눌 수 없으며, 임의의 백분율로 보정하지 않았다.

## 이벤트 호출량 비교

| 구분 | 일평균 호출량 |
|---|---:|
| 평시 | 0.00 |
| 이벤트 | 12,507,656.57 |
| 증가율 | 산정 불가 (평시 기준값 0) |
| 판정 | **정량 판정 불가 (평시 기준값 0)** |

## 업무시간대 분포

![시간대별 호출량](/img/oracle-sql-workload-hourly-executions.png)

![시간대별 CPU 사용시간](/img/oracle-sql-workload-hourly-cpu.png)

![시간대별 수행시간](/img/oracle-sql-workload-hourly-elapsed.png)

| 시간 | 호출량 | CPU 시간(초) | 수행시간(초) |
|---:|---:|---:|---:|
| 08:00 | 2,516,359 | 327,840.00 | 92,383.33 |
| 09:00 | 5,162,124 | 398,690.00 | 120,624.02 |
| 10:00 | 3,482,499 | 553,220.00 | 163,140.33 |
| 11:00 | 6,374,422 | 536,550.00 | 150,259.41 |
| 12:00 | 4,222,651 | 531,530.00 | 167,041.28 |
| 13:00 | 3,528,899 | 577,920.00 | 154,415.75 |
| 14:00 | 3,866,232 | 667,990.00 | 183,942.04 |
| 15:00 | 3,692,854 | 786,030.00 | 190,546.28 |
| 16:00 | 4,270,614 | 725,100.00 | 222,179.97 |
| 17:00 | 3,672,640 | 671,850.00 | 188,625.89 |
| 18:00 | 4,975,877 | 683,590.00 | 225,353.94 |
| 19:00 | 4,239,845 | 681,200.00 | 217,828.46 |
| 20:00 | 4,518,503 | 707,930.00 | 231,387.34 |
| 21:00 | 4,093,230 | 604,030.00 | 211,093.79 |
| 22:00 | 3,568,318 | 458,960.00 | 214,074.06 |
| 23:00 | 2,973,262 | 287,010.00 | 110,213.69 |

## 전체 기간 호출량 Top 10 SQL

![Top 10 SQL 시간대별 호출량](/img/oracle-sql-workload-top10-hourly.png)

| 순위 | SQL_ID | 전체 호출량 | 평시 일평균 | 이벤트 일평균 | 증가율 | SQL 본문 |
|---:|---|---:|---:|---:|---:|---|
| 1 | `16qwxytrfj6zd` | 32,399,428 | 0.00 | 4,628,489.71 | 산정 불가 (평시 기준값 0) | 있음 |
| 2 | `b3853arjnybzv` | 25,294,987 | 0.00 | 3,613,569.57 | 산정 불가 (평시 기준값 0) | 있음 |
| 3 | `1prf56wd8r1j0` | 5,545,685 | 0.00 | 792,240.71 | 산정 불가 (평시 기준값 0) | 있음 |
| 4 | `aruykmcqdngs4` | 5,313,110 | 0.00 | 759,015.71 | 산정 불가 (평시 기준값 0) | 있음 |
| 5 | `1t3auc3jucfkf` | 4,995,339 | 0.00 | 713,619.86 | 산정 불가 (평시 기준값 0) | 있음 |
| 6 | `567rnx0rfgkyj` | 3,179,559 | 0.00 | 454,222.71 | 산정 불가 (평시 기준값 0) | 있음 |
| 7 | `49fxwd4b6mvwh` | 3,058,744 | 0.00 | 436,963.43 | 산정 불가 (평시 기준값 0) | 있음 |
| 8 | `0zyx16g6ham1s` | 2,222,807 | 0.00 | 317,543.86 | 산정 불가 (평시 기준값 0) | 있음 |
| 9 | `15pqjykdhx819` | 915,241 | 0.00 | 130,748.71 | 산정 불가 (평시 기준값 0) | 있음 |
| 10 | `dz51btcgxpm51` | 820,246 | 0.00 | 117,178.00 | 산정 불가 (평시 기준값 0) | 있음 |

## Top 10 SQL 본문

### 1. `16qwxytrfj6zd`

```sql
SELECT *
        FROM (
                 SELECT derived.bizplc_cd
                      , derived.bizplc_nm
                      , derived.open_ymd
                      , derived.clstr_ymd
                      , derived.sal_cls_ymd
                      , derived.lat
                      , derived.lng
                      , derived.kwd_nm
                      , store_image_url
                      , derived.sigungu
                      , derived.detail_addr1
                      , derived.detail_addr2
                      , derived.str_typ_cd
                      , derived.bizplc_typ_cd
                      , derived.bizplc_shape_cd
                      , derived.dmng_fc_sp_cd
                      , (6371 * ACOS(LEAST(1, GREATEST(-1,
                                                       COS(:1  * (3.141592653589793/180)) /* RADIAN 계산 */
                                                           * COS(derived.lat * (3.141592653589793/180))
                                                           * COS((derived.lng - :2 ) * (3.141592653589793/180))
                                                           + SIN(:3  * (3.141592653589793/180))
                                                           * SIN(derived.lat * (3.141592653589793/180))
                                              )))) AS distance
                 FROM (SELECT sbm.bizplc_cd
                            , sbm.bizplc_nm
                            , sbm.open_ymd
                            , sbm.clstr_ymd
                            , sbm.sal_cls_ymd
                            , sbal.lat
                            , sbal.lng
                            , ssiil.kwd_nm
                            , ssafl.attch_file_nm    AS store_image_url
                            , sbm.rd_nm_sigungu_addr AS sigungu
                            , sbm.rd_nm_dtl_addr1    AS detail_addr1
                            , sbm.rd_nm_dtl_addr2    AS detail_addr2
                            , sbm.str_typ_cd
                            , sbm.bizplc_typ_cd
                            , sbm.bizplc_shape_cd
                            , sbm.dmng_fc_sp_cd
                       FROM TB_SA_BIZPLC_M sbm
                                LEFT OUTER JOIN TB_SA_BIZPLC_ADD_L sbal
                                                ON sbm.bizplc_cd = sbal.str_cd
                                LEFT OUTER JOIN TB_SA_STR_INTG_INFO_L ssiil
                                                ON sbm.bizplc_cd = ssiil.str_cd
                                LEFT OUTER JOIN tb_sa_str_attch_file_l ssafl
                                                ON sbm.bizplc_cd = ssafl.str_cd
                                                    AND ssafl.main_img_yn = 'Y'
                                                    AND ssafl.del_yn = 'N'
                                LEFT OUTER JOIN frameone_code fc
                                                ON fc.comm_cl_cd = 'CD1258' /* MFC매장 공통그룹코드 */
                                                    AND sbm.bizplc_cd = fc.comm_cd
                       WHERE sbm.str_typ_cd IN ('D', 'B', 'E') /* 매장유형코드 직영/가맹/PS */
                         AND (sbm.clstr_ymd IS NULL OR sbm.clstr_ymd  >  TO_CHAR(SYSDATE, 'YYYYMMDD'))
                         AND (sbm.sal_cls_ymd IS NULL OR sbm.sal_cls_ymd  >  TO_CHAR(SYSDATE, 'YYYYMMDD'))
                         AND sbal.lat BETWEEN (:4  - 0.180180) AND (:5  + 0.180180)
                         AND sbal.lng BETWEEN (:6  - (20/(111*COS(:7  * (3.141592653589793/180))))) AND (:8  + (20/(111*COS(:9  * (3.141592653589793/180)))))
                         AND sbal.disp_yn = 'Y'
                         AND fc.comm_cd IS NULL) derived
             ) t
        WHERE t.distance  <=  :10
        ORDER BY t.distance
        OFFSET (:11 -1)*:12  ROWS FETCH NEXT :13  ROWS ONLY
```

### 2. `b3853arjnybzv`

```sql
INSERT INTO AUDSYS.AUD$UNIFIED (AUDIT_TYPE, SESSIONID, PROXY_SESSIONID, OS_USER, HOST_NAME, TERMINAL, INSTANCE_ID, DBID, AUTHENTICATION_TYPE, USERID, PROXY_USERID, EXTERNAL_USERID, GLOBAL_USERID, CLIENT_PROGRAM_NAME, DBLINK_INFO, XS_USER_NAME, XS_SESSIONID, ENTRY_ID, STATEMENT_ID, EVENT_TIMESTAMP, ACTION, RETURN_CODE, OS_PROCESS, TRANSACTION_ID, SCN, EXECUTION_ID, OBJ_OWNER, OBJ_NAME, CLIENT_IDENTIFIER, NEW_OWNER, NEW_NAME, OBJECT_EDITION, SYSTEM_PRIVILEGE_USED, SYSTEM_PRIVILEGE, AUDIT_OPTION, OBJECT_PRIVILEGES, ROLE, TARGET_USER, EXCLUDED_USER, EXCLUDED_SCHEMA, EXCLUDED_OBJECT, CURRENT_USER, ADDITIONAL_INFO, UNIFIED_AUDIT_POLICIES) values (:AUDIT_TYPE, :SESSIONID, :PROXY_SESSIONID, :OS_USER, :HOST_NAME, :TERMINAL, :INSTANCE_ID, :DBID, :AUTHENTICATION_TYPE, :USERID, :PROXY_USERID, :EXTERNAL_USERID, :GLOBAL_USERID, :CLIENT_PROGRAM_NAME, :DBLINK_INFO, :XS_USER_NAME, :XS_SESSIONID, :ENTRY_ID, :STATEMENT_ID, :EVENT_TIMESTAMP, :ACTION, :RETURN_CODE, :OS_PROCESS, :TRANSACTION_ID, :SCN, :EXECUTION_ID, :OBJ_OWNER, :OBJ_NAME, :CLIENT_IDENTIFIER, :NEW_OWNER, :NEW_NAME, :OBJECT_EDITION, :SYSTEM_PRIVILEGE_USED, :SYSTEM_PRIVILEGE, :AUDIT_OPTION, :OBJECT_PRIVILEGES, :ROLE, :TARGET_USER, :EXCLUDED_USER, :EXCLUDED_SCHEMA, :EXCLUDED_OBJECT, :CURRENT_USER, :ADDITIONAL_INFO, :UNIFIED_AUDIT_POLICIES)
```

### 3. `1prf56wd8r1j0`

```sql
/* Executed : calculation-batch OOBAT */ select tbscsalagg0_.POS_NO as pos_no1_19_0_, tbscsalagg0_.SAL_YMD as sal_ymd2_19_0_, tbscsalagg0_.SALE_SEQ as sale_seq3_19_0_, tbscsalagg0_.STR_CD as str_cd4_19_0_, tbscsalagg0_.MOD_DT as mod_dt5_19_0_, tbscsalagg0_.MOD_USR_ID as mod_usr_id6_19_0_, tbscsalagg0_.REG_DT as reg_dt7_19_0_, tbscsalagg0_.REG_USR_ID as reg_usr_id8_19_0_, tbscsalagg0_.BTCH_PRGR_STAT_CD as btch_prgr_stat_cd9_19_0_, tbscsalagg0_.DEAL_SP_CD as deal_sp_cd10_19_0_, tbscsalagg0_.RCPT_NO as rcpt_no11_19_0_ from OOADM.TB_SC_SAL_AGG_TGT_L tbscsalagg0_ where tbscsalagg0_.POS_NO=:1  and tbscsalagg0_.SAL_YMD=:2  and tbscsalagg0_.SALE_SEQ=:3  and tbscsalagg0_.STR_CD=:4
```

### 4. `aruykmcqdngs4`

```sql
/* Executed : calculation-batch OOBAT */ update OOADM.TB_SC_SAL_AGG_TGT_L set MOD_DT=:1 , MOD_USR_ID=:2 , REG_DT=:3 , REG_USR_ID=:4 , BTCH_PRGR_STAT_CD=:5 , DEAL_SP_CD=:6 , RCPT_NO=:7  where POS_NO=:8  and SAL_YMD=:9  and SALE_SEQ=:10  and STR_CD=:11
```

### 5. `1t3auc3jucfkf`

```sql
/* StrSkuRnpMapper.insertStrSkuRnp */
        INSERT INTO
            OOIIAPP.TB_ST_STR_RNP_SKU_DD_A_TEST
            (
              RNP_YMD
             ,STR_CD
             ,GDS_CD
             ,BAS_STK_QTY
             ,BAS_STK_AMT
             ,R1_BUY_QTY
             ,R1_BUY_AMT
             ,R3_BUY_QTY
             ,R3_BUY_AMT
             ,R1_RTN_QTY
             ,R1_RTN_AMT
             ,R3_RTN_QTY
             ,R3_RTN_AMT
             ,R1_NET_BUY_QTY
             ,R1_NET_BUY_AMT
             ,R3_NET_BUY_QTY
             ,R3_NET_BUY_AMT
             ,R3_BUYRTRNS_AMT
             ,MOV_QTY
             ,MOV_AMT
             ,DMNG_DMNG_MOV_STKIN_QTY
             ,DMNG_DMNG_MOV_STKIN_AMT
             ,DMNG_DMNG_MOV_STKOUT_QTY
             ,DMNG_DMNG_MOV_STKOUT_AMT
             ,DMNG_FC_MOV_STKIN_QTY
             ,DMNG_FC_MOV_STKIN_AMT
             ,DMNG_FC_MOV_STKOUT_QTY
             ,DMNG_FC_MOV_STKOUT_AMT
             ,FC_DMNG_MOV_STKIN_QTY
             ,FC_DMNG_MOV_STKIN_AMT
             ,FC_DMNG_MOV_STKOUT_QTY
             ,FC_DMNG_MOV_STKOUT_AMT
             ,FC_FC_MOV_STKIN_QTY
             ,FC_FC_MOV_STKIN_AMT
             ,FC_FC_MOV_STKOUT_QTY
             ,FC_FC_MOV_STKOUT_AMT
             ,NORM_SEL_QTY
             ,NORM_SAL_AMT
             ,SEL_QTY
             ,NET_SAL_AMT
             ,SAL_VAT_AMT
             ,SAL_COST_AMT
             ,STK_DCLS_QTY
             ,STK_DCLS_AMT
             ,STK_QTY
             ,STK_AMT
             ,RLSTK_QTY
             ,RLSTK_AMT
             ,STK_EXAM_YN
             ,STK_COST_UPRC
             ,ACM_STK_AMT
             ,ACM_SAL_COST_AMT
             ,PRSNT_QTY
             ,PRSNT_AMT
             ,ETC_STKOUT_SPCRNT_QTY
             ,ETC_STKOUT_SPCRNT_AMT
             ,ETC_STKOUT_DON_QTY
             ,ETC_STKOUT_DON_AMT
             ,SELFCS_QTY
             ,SELFCS_AMT
             ,SELFCS_STKOUT_HQ_PR_QTY
             ,SELFCS_STKOUT_HQ_PR_AMT
             ,SELFCS_STR_PR_QTY
             ,SELFCS_STR_PR_AMT
             ,SELFCS_CONSUM_QTY
             ,SELFCS_CONSUM_AMT
             ,SELFCS_WFRE_QTY
             ,SELFCS_WFRE_AMT
             ,SELFCS_SMCRG_QTY
             ,SELFCS_SMCRG_AMT
             ,SCRP_QTY
             ,SCRP_AMT
             ,STK_ADJ_QTY
             ,STK_ADJ_AMT
             ,CUST_MANUAL_RTN_QTY
             ,CUST_MANUAL_RTN_AMT
             ,CUST_RCPT_RTN_QTY
             ,CUST_RCPT_RTN_AMT
             ,RNP_DIFF_ADJ_AMT
             ,BRND_CD
             ,VAT_SP_CD
             ,SUPLR_CD
             ,BIZPLC_TYP_CD
             ,DMNG_FC_SP_CD
             ,STR_TYP_CD
             ,BIZPLC_SHAPE_CD
             ,GDS_LCLS_CD
             ,GDS_MCLS_CD
             ,GDS_SCLS_CD
             ,FC_MOV_AVG_STKOUT_AMT
             ,FC_MOV_AVG_SAL_COST_AMT
             ,REG_USR_ID
             ,REG_DT
             ,MOD_USR_ID
             ,MOD_DT
        ) VALUES (
              :1
             ,:2
             ,:3
             ,:4
             ,:5
             ,:6
             ,:7
             ,:8
             ,:9
             ,:10
             ,:11
             ,:12
             ,:13
             ,:14
             ,:15
             ,:16
             ,:17
             ,:18
             ,:19
             ,:20
             ,:21
             ,:22
             ,:23
             ,:24
             ,:25
             ,:26
             ,:27
             ,:28
             ,:29
             ,:30
             ,:31
             ,:32
             ,:33
             ,:34
             ,:35
             ,:36
             ,:37
             ,:38
             ,:39
             ,:40
             ,:41
             ,:42
             ,:43
             ,:44
             ,:45
             ,:46
             ,:47
             ,:48
             ,:49
             ,:50
             ,:51
             ,:52
             ,:53
             ,:54
             ,:55
             ,:56
             ,:57
             ,:58
             ,:59
             ,:60
             ,:61
             ,:62
             ,:63
             ,:64
             ,:65
             ,:66
             ,:67
             ,:68
             ,:69
             ,:70
             ,:71
             ,:72
             ,:73
             ,:74
             ,:75
             ,:76
             ,:77
             ,:78
             ,0
             ,:79
             ,:80
             ,:81
             ,:82
             ,:83
             ,:84
             ,:85
             ,:86
             ,:87
             ,:88
             ,:89
             ,:90
             ,:91
             ,SYSDATE
             ,:92
             ,SYSDATE
        )
```

### 6. `567rnx0rfgkyj`

```sql
SELECT NVL(T.STR_CD,E.STR_CD) AS STR_CD ,NVL(T.REAL_SAL_AMT, 0) AS REAL_SAL_AMT ,NVL(T.REAL_SAL_VAT_AMT, 0) AS REAL_SAL_VAT_AMT ,NVL(T.TAXN_SAL_AMT, 0) AS TAXN_SAL_AMT ,NVL(T.TXFREE_SAL_AMT, 0) AS TXFREE_SAL_AMT ,NVL(T.TXZERO_SAL_AMT, 0) AS TXZERO_SAL_AMT ,NVL(T.DC_COUPN_SAL_AMT, 0) AS DC_COUPN_SAL_AMT ,NVL(T.DC_COUPN_VAT_AMT, 0) AS DC_COUPN_VAT_AMT ,NVL(T.CARD_CO_BRD_AMT, 0) AS CARD_CO_BRD_AMT ,NVL(T.CARD_CO_BRD_VAT_AMT, 0) AS CARD_CO_BRD_VAT_AMT ,NVL(T.COOP_CARD_CO_BRD_AMT, 0) AS COOP_CARD_CO_BRD_AMT ,NVL(T.COOP_CARD_CO_BRD_VAT_AMT, 0) AS COOP_CARD_CO_BRD_VAT_AMT ,NVL(T.COOP_MYCO_DC_ALLOTM_AMT, 0) AS COOP_MYCO_DC_ALLOTM_AMT ,NVL(T.COOP_MYCO_DC_BRD_VAT_AMT, 0) AS COOP_MYCO_DC_BRD_VAT_AMT FROM ( SELECT STR_CD , SUM(REAL_SAL_AMT) AS REAL_SAL_AMT , SUM(REAL_SAL_VAT_AMT) AS REAL_SAL_VAT_AMT , SUM(TAXN_SAL_AMT) AS TAXN_SAL_AMT , SUM(TXFREE_SAL_AMT) AS TXFREE_SAL_AMT , SUM(TXZERO_SAL_AMT) AS TXZERO_SAL_AMT , SUM(DC_COUPN_SAL_AMT) AS DC_COUPN_SAL_AMT , SUM(DC_COUPN_VAT_AMT) AS DC_COUPN_VAT_AMT , SUM(CARD_CO_BRD_AMT) AS CARD_CO_BRD_AMT , SUM(CARD_CO_BRD_VAT_AMT) AS CARD_CO_BRD_VAT_AMT , SUM(COOP_CARD_CO_BRD_AMT) AS COOP_CARD_CO_BRD_AMT , SUM(COOP_CARD_CO_BRD_VAT_AMT) AS COOP_CARD_CO_BRD_VAT_AMT , SUM(COOP_MYCO_DC_ALLOTM_AMT) AS COOP_MYCO_DC_ALLOTM_AMT , SUM(COOP_MYCO_DC_BRD_VAT_AMT) AS COOP_MYCO_DC_BRD_VAT_AMT FROM TB_SC_EXCALC_GDS_A A , TB_SA_BIZPLC_M B WHERE SLBIZ_YMD = :B2 AND STR_CD = NVL(:B1 , STR_CD) AND A.STR_CD = B.BIZPLC_CD(+) AND B.DMNG_FC_SP_CD = 'D' GROUP BY STR_CD ) T FULL OUTER JOIN ( SELECT STR_CD FROM TB_SC_SAL_DYRPT_ACCT_A A ,TB_SA_BIZPLC_M B WHERE A.SLBIZ_YMD = :B2 AND A.STR_CD = NVL(:B1 , A.STR_CD) AND A.STR_CD = B.BIZPLC_CD(+) AND B.DMNG_FC_SP_CD = 'D' AND A.EXCALC_MNG_CD = '5' AND A.EXCALC_MNG_DTL_CD IN('06','07') AND ABS(NVL(A.SAL_AMT,0)) > 0 GROUP BY STR_CD ) E ON T.STR_CD = E.STR_CD ORDER BY NVL(T.STR_CD,E.STR_CD)
```

### 7. `49fxwd4b6mvwh`

```sql
/* Executed : calculation-batch OOBAT */
    MERGE INTO TB_PR_PRMTN_ARSLT_L target
    USING (SELECT
            :1  AS SLBIZ_YMD,
            :2  AS SPRMTN_CD,
            :3  AS PRMTN_COND_NO,
            :4  AS STR_CD,
            :5  AS GDS_CD,
            :6  AS GDS_LCLS_CD,
            :7  AS GDS_MCLS_CD,
            :8  AS GDS_SCLS_CD,
            :9  AS LPRMTN_CD,
            :10  AS COST_UPRC,
            :11  AS SELPRC_UPRC,
            :12  AS PRMTN_QTY,
            :13  AS PRMTN_AMT,
            :14  AS SEL_QTY,
            :15  AS SEL_AMT,
            :16  AS VAT_AMT,
            :17  AS PNT_GDS_QTY,
            :18  AS PRMTN_BASC_PNT_SCOR,
            :19  AS PNT_MTPL,
            :20  AS PRMTN_ACCM_PNT_SCOR,
            :21  AS COUPN_CD,
            :22  AS COUPN_GDS_QTY,
            :23  AS DC_FAMT_FRT_SP_CD,
            :24  AS COUPN_APPLY_UPRC,
            :25  AS COUPN_DC_AMT,
            :26  AS GIFT_QTY,
            :27  AS CJONE_PNT_TENDER_AMT,
            :28  AS CJONE_PNT_DC_AMT,
            :29  AS VAT_SP_CD,
            :30  AS GDS_NM,
            :31  AS MD_EMP_CD,
            :32  AS REG_USR_ID,
            :33  AS REG_DT,
            :34  AS MOD_USR_ID,
            :35  AS MOD_DT
           FROM dual) src
    ON (target.SLBIZ_YMD = src.SLBIZ_YMD AND target.SPRMTN_CD = src.SPRMTN_CD AND target.PRMTN_COND_NO = src.PRMTN_COND_NO AND target.STR_CD = src.STR_CD AND target.GDS_CD = src.GDS_CD)
    WHEN MATCHED THEN
        UPDATE SET
            target.COUPN_GDS_QTY = target.COUPN_GDS_QTY + src.COUPN_GDS_QTY,
            target.COUPN_DC_AMT = target.COUPN_DC_AMT + src.COUPN_DC_AMT,
            target.PRMTN_QTY = target.PRMTN_QTY + src.PRMTN_QTY,
            target.PRMTN_AMT = target.PRMTN_AMT + src.PRMTN_AMT,
            target.SEL_QTY = target.SEL_QTY + src.SEL_QTY,
            target.SEL_AMT = target.SEL_AMT + src.SEL_AMT,
            target.VAT_AMT = target.VAT_AMT + src.VAT_AMT,
            target.PNT_GDS_QTY = target.PNT_GDS_QTY + src.PNT_GDS_QTY,
            target.PRMTN_BASC_PNT_SCOR = target.PRMTN_BASC_PNT_SCOR + src.PRMTN_BASC_PNT_SCOR,
            target.PNT_MTPL = target.PNT_MTPL + src.PNT_MTPL,
            target.PRMTN_ACCM_PNT_SCOR = target.PRMTN_ACCM_PNT_SCOR + src.PRMTN_ACCM_PNT_SCOR,
            target.COUPN_APPLY_UPRC = target.COUPN_APPLY_UPRC + src.COUPN_APPLY_UPRC,
            target.GIFT_QTY = target.GIFT_QTY + src.GIFT_QTY,
            target.MOD_DT = SYSDATE
    WHEN NOT MATCHED THEN
    INSERT (SLBIZ_YMD, SPRMTN_CD, PRMTN_COND_NO, STR_CD , GDS_CD , GDS_LCLS_CD, GDS_MCLS_CD, GDS_SCLS_CD,
            LPRMTN_CD, COST_UPRC, SELPRC_UPRC, PRMTN_QTY, PRMTN_AMT, SEL_QTY, SEL_AMT, VAT_AMT, PNT_GDS_QTY,
            PRMTN_BASC_PNT_SCOR, PNT_MTPL, PRMTN_ACCM_PNT_SCOR, COUPN_CD, COUPN_GDS_QTY, DC_FAMT_FRT_SP_CD,
            COUPN_APPLY_UPRC, COUPN_DC_AMT, GIFT_QTY, CJONE_PNT_TENDER_AMT, CJONE_PNT_DC_AMT,
            VAT_SP_CD, GDS_NM, MD_EMP_CD,
            REG_USR_ID, REG_DT, MOD_USR_ID, MOD_DT)
    VALUES (src.SLBIZ_YMD, src.SPRMTN_CD, src.PRMTN_COND_NO, src.STR_CD , src.GDS_CD , src.GDS_LCLS_CD, src.GDS_MCLS_CD, src.GDS_SCLS_CD,
            src.LPRMTN_CD, src.COST_UPRC, src.SELPRC_UPRC, src.PRMTN_QTY, src.PRMTN_AMT, src.SEL_QTY, src.SEL_AMT, src.VAT_AMT, src.PNT_GDS_QTY,
            src.PRMTN_BASC_PNT_SCOR, src.PNT_MTPL, src.PRMTN_ACCM_PNT_SCOR, src.COUPN_CD , src.COUPN_GDS_QTY, src.DC_FAMT_FRT_SP_CD,
            src.COUPN_APPLY_UPRC, src.COUPN_DC_AMT, src.GIFT_QTY, src.CJONE_PNT_TENDER_AMT, src.CJONE_PNT_DC_AMT,
            src.VAT_SP_CD, src.GDS_NM, src.MD_EMP_CD,
            src.REG_USR_ID, SYSDATE, src.MOD_USR_ID, SYSDATE)
```

### 8. `0zyx16g6ham1s`

```sql
SELECT /* [Goods.xml](oracle)[selectGoodsMasterInfo][상품정보조회][Park SeonJu][2022-06-13] */
             :1  AS STR_CD
             , T1.STR_NM
             , T1.GDS_CD
             , T1.GDS_NM                                    /* 상품 */
             , T7.GDS_SCLS_CD
             , T7.GDS_SCLS_NM
             , T8.GDS_MCLS_CD
             , T8.GDS_MCLS_NM
             , T9.GDS_LCLS_CD
             , T9.GDS_LCLS_NM
             , T1.R3_R1
             , T1.SUPLR_NM                                      /* 거래처 */
             , T1.GDS_STAT_CD                                   /* 상품상태 */
             , T1.PO_END_RSN_CD                                 /* 상품상태변경사유 */
             , NVL(T5.GDS_SELPRC_UPRC,0) AS gdsSelprcUprc  /* 기준매가 */

             , 0  AS usflStkQty                               /* 가용재고 */

             , T1.SEL_END_YMD                               /* 판매종료 */
             , (REGEXP_REPLACE(T1.STR_PO_DT_STOP_STRT_YMD, '(.{4})(.{2})(.{2})', '\1-\2-\3') || '~' || REGEXP_REPLACE(T1.STR_PO_DT_STOP_END_YMD, '(.{4})(.{2})(.{2})', '\1-\2-\3')) AS strPoDtStopYmd
             , T1.STR_PO_DT_STOP_STRT_YMD
             , T1.STR_PO_DT_STOP_END_YMD
             , T1.STR_PO_DT_STOP_RSN_CD
             , (SELECT X.COMM_CD_NM FROM FRAMEONE.FRAMEONE_CODE_LANGUAGE X WHERE X.COMM_CL_CD = 'CD0053' AND X.LANG_CL = 'ko' AND X.COMM_CD = T1.STR_PO_DT_STOP_RSN_CD) AS strPoDtStopRsnNm
             , T1.CNTR_PO_DT_STOP_STRT_YMD                  /* 센터발주일시중지시작일자 */
             , T1.CNTR_PO_DT_STOP_END_YMD                   /* 센터발주일시중지종료일자 */
             , T1.CNTR_PO_DT_STOP_RSN_CD                    /* 센터발주일시중지사유코드 */
             , T10.RNP_YMD  AS FNL_STKIN_DT /* 최근 입고일자 */
             , NVL(T11.SALE_QTY,0) AS STDRD_PTM_AFT_SEL_QTY /* 재고조사업로드시점까지 판매된 수량*/
             , NVL(T12.EXAM_QTY, 0) AS FNL_EXAM_QTY /* 최근 조사 수량 */
             , T12.MOD_DT AS FNL_MOD_DT     /* 최근수정일자 */
            , CASE
                WHEN T9.GDS_LCLS_CD = '07' THEN 'Y'
                WHEN T9.GDS_LCLS_CD = '08' AND T13.innerBeautyCnt  >  0 THEN 'Y'
                WHEN T9.GDS_LCLS_CD = '11' THEN 'Y'
                WHEN T14.wCareCnt  >  0 THEN 'Y'
                ELSE 'N'
              END AS wellnessProductsYn
        FROM (
            SELECT
                   :2  AS STR_CD
                 , D.BIZPLC_NM AS STR_NM
                 , C.SEL_END_YMD
                 , B.GDS_SCLS_CD
                 , B.GDS_CD
                 , B.GDS_NM
                 , B.GDS_STAT_CD            /* 상품상태 */
                 , C.CNTR_PO_DT_STOP_STRT_YMD   /* 센터발주일시중지시작일자 */
                 , C.CNTR_PO_DT_STOP_END_YMD    /* 센터발주일시중지종료일자 */
                 , C.CNTR_PO_DT_STOP_RSN_CD     /* 센터발주일시중지사유코드 */
                 , C.DLV_TYP_CD AS R3_R1
                 , D.DMNG_FC_SP_CD
                 , E.CORPCO_NM AS SUPLR_NM  /* 거래처 */
                 , G.STR_PO_DT_STOP_STRT_YMD
                 , G.STR_PO_DT_STOP_END_YMD
                 , G.STR_PO_DT_STOP_RSN_CD
                 , C.PO_END_RSN_CD          /* 상태변경사유 */
                 , D.SEL_CHNL_CD
                 , B.GDS_CLS_APPLY_YMD
                 , B.BEF_GDS_SCLS_CD
            FROM
                 TB_MD_GDS_M           B  /* TABLE : MD_상품마스터 */
               , TB_MD_GDS_PO_S        C  /* TABLE : MD_상품발주기준 */
               , TB_SA_BIZPLC_M        D  /* TABLE : SA_사업장마스터 */
               , TB_PT_CORPCO_M        E  /* TABLE : PT_협력사마스터 */
               , TB_PT_DSTBTR_M        F
               , TB_MD_GDS_DSTBTR_PO_S G  /* TABLE : MD_상품배송처발주기준 */
            WHERE
              B.SUPLR_CD = E.CORPCO_CD
              AND B.GDS_CD = C.GDS_CD (+)
              AND :3  = D.BIZPLC_CD
              AND F.DSTBTR_CD = NVL(B.DSTBTR_CD,(SELECT X.DSTBTR_CD
                                                 FROM TB_PT_STR_MVNDR_L X     /* PT_매장다벤더내역 */
                                                 WHERE X.STR_CD = :4
                                                   AND X.MVNDR_CD = B.MVNDR_CD
                                                   AND X.APPLY_STRT_YMD = (SELECT MAX(Z.APPLY_STRT_YMD)
                                                                           FROM TB_PT_STR_MVNDR_L Z
                                                                           WHERE Z.APPLY_STRT_YMD  <=  TO_CHAR(SYSDATE,'YYYYMMDD')
                                                                             AND Z.STR_CD = X.STR_CD
                                                                             AND Z.MVNDR_CD = X.MVNDR_CD
                                                 )
                )
                )
              AND F.DSTBTR_CD = G.DSTBTR_CD(+)
              AND B.GDS_CD = G.GDS_CD(+)
        ) T1
        , TB_MD_GDS_SELPRC_L    T5 /* TABLE : MD_상품매가내역 */

        , TB_MD_GDS_SCLS_C T7
        , TB_MD_GDS_MCLS_C T8
        , TB_MD_GDS_LCLS_C T9
        , (SELECT MAX(GDS_CD) AS GDS_CD
                , REGEXP_REPLACE(MAX(RNP_YMD ), '(.{4})(.{2})(.{2})', '\1.\2.\3') AS RNP_YMD
          FROM TB_ST_STR_BUY_L
            WHERE STR_CD = :5
              AND GDS_CD = :6
              AND BUY_SP_CD   = 'B1'    /* B1: 매입, B6: 현금매입 */
              AND BUY_INPT_SP_CD = '1'
        ) T10
       , (
            /* 판매내역 */
            SELECT TO_CHAR(SYSDATE,'YYYYMMDD')  AS SLBIZ_YMD
                 , TI.GOODS_CD AS GDS_CD
                 , SUM(TI.SALE_QTY) AS SALE_QTY
                 , MAX(TH.SALE_END_DT) AS SALE_END_DT
            FROM TS_TR_HEADER TH
               , TS_TR_ITEM TI
            WHERE TH.OPER_DT = TI.OPER_DT(+)
              AND TH.POS_NO = TI.POS_NO(+)
              AND TH.RECEIPT_NO = TI.RECEIPT_NO
              AND TH.DEAL_SP in ('11','17')
              AND NVL(TI.SALE_BUY_TRUST_SP,'0') NOT IN ('1','3') /* 조건 : 판매분매입 제외  */
              AND TI.SALE_SP != '04'                             /* 조건 : 단품취소 제외 */
              AND TH.ORIGIN_BIZPL_CD = :7          /* 매장코드 */
              AND TH.OPER_DT         = TO_CHAR(SYSDATE,'YYYYMMDD')   /* 필수 : 수신일자1 */
              AND TI.ORIGIN_BIZPL_CD = :8          /* 매장코드 */
              AND TI.OPER_DT         = TO_CHAR(SYSDATE,'YYYYMMDD')  /* 필수 : 수신일자1 */
              AND TI.GOODS_CD = :9
              AND TH.SALE_END_DT BETWEEN TO_DATE(TO_CHAR(SYSDATE,  'YYYYMMDD') || '000000','YYYYMMDDHH24MISS') AND SYSDATE
            GROUP BY TI.GOODS_CD
         ) T11
       , (SELECT X.GDS_CD
                , X.EXAM_QTY
                , X.STK_EXAM_YMD
                , X.MOD_DT
           FROM (SELECT X.GDS_CD
                       , X.EXAM_QTY
                       , X.STK_EXAM_YMD
                       , TO_CHAR(X.MOD_DT,'YYYY.MM.DD') AS MOD_DT
                       , ROW_NUMBER() OVER(ORDER BY  X.STK_EXAM_YMD DESC,  X.STK_EXAM_DTLS_SEQ DESC) AS RNK
                   FROM TB_ST_STR_SELF_EXAM_L X
                  WHERE X.STR_CD = :10
                    AND X.GDS_CD = :11
                    AND X.STR_STK_EXAM_SP_CD = '2'
                 ) X
            WHERE X.RNK = 1
         ) T12
        ,(
            SELECT
            count(*) AS innerBeautyCnt
            FROM TB_MD_GDS_ATT_ITM_C C
            , TB_MD_GDS_ATT_L D
            , TB_MD_GDS_ATT_VAL_C E
            WHERE C.GDS_ATT_ITM_CD = D.GDS_ATT_ITM_CD
            AND C.GDS_ATT_ITM_CD = E.GDS_ATT_ITM_CD
            AND D.GDS_ATT_VAL_CD = E.GDS_ATT_VAL_CD
            AND D.GDS_CD = :12
            AND C.USE_YN = 'Y'
            AND C.GDS_ATT_NM = '이너뷰티'
            AND E.GDS_ATT_VAL_NM = 'Y'
        ) T13
        ,(
            SELECT
            count(*) AS wCareCnt
            FROM TB_MD_GDS_ATT_ITM_C C
            , TB_MD_GDS_ATT_L D
            , TB_MD_GDS_ATT_VAL_C E
            WHERE C.GDS_ATT_ITM_CD = D.GDS_ATT_ITM_CD
            AND C.GDS_ATT_ITM_CD = E.GDS_ATT_ITM_CD
            AND D.GDS_ATT_VAL_CD = E.GDS_ATT_VAL_CD
            AND D.GDS_CD = :13
            AND C.USE_YN = 'Y'
            AND C.GDS_ATT_NM = 'W케어'
            AND E.GDS_ATT_VAL_NM = 'Y'
        ) T14
        WHERE 1=1
          AND T1.GDS_CD      = T5.GDS_CD (+)
          AND T1.SEL_CHNL_CD = T5.SEL_CHNL_CD (+)

          AND T1.STR_CD      = :14                          /*필수:매장*/
          AND TO_CHAR(SYSDATE,'YYYYMMDD') BETWEEN T5.APPLY_STRT_YMD AND T5.APPLY_END_YMD  /*적용일시 기간*/

          AND T1.GDS_CD = :15
          AND ((T1.GDS_SCLS_CD     = T7.GDS_SCLS_CD AND T1.GDS_CLS_APPLY_YMD  <=  TO_CHAR(SYSDATE, 'YYYYMMDD')) OR
               (T1.BEF_GDS_SCLS_CD = T7.GDS_SCLS_CD AND T1.GDS_CLS_APPLY_YMD   >  TO_CHAR(SYSDATE, 'YYYYMMDD')))
          AND T7.GDS_MCLS_CD = T8.GDS_MCLS_CD
          AND T8.GDS_LCLS_CD = T9.GDS_LCLS_CD
          AND T1.GDS_CD = T10.GDS_CD(+)
          AND T1.GDS_CD = T11.GDS_CD(+)
          AND T1.GDS_CD = T12.GDS_CD(+)
```

### 9. `15pqjykdhx819`

```sql
SELECT  /* [Goods.xml][selectGdsPog][상품 pog 정보 조회][Park SeonJu][2022-06-07] */
            *
        FROM (SELECT  A.POG_NO
                   , A.POG_NM
                   , (SELECT MAX(POG_BAY_NO) FROM TB_PG_POG_GDS_L WHERE POG_NO = A.POG_NO) AS MAX_POG_BAY_NO
                   , E.DISP_LCLS_NM || '/' || D.DISP_MCLS_NM || '/' || B.DISP_SCLS_NM AS POG_DISP_NM
              FROM TB_PG_POG_B_H          A /* PG_POG기본이력 */
                 , TB_PG_DISP_SCLS_C      B /* PG_POG소분류코드 */
                 , TB_PG_DISP_MCLS_C      D /* PG_POG중분류코드 */
                 , TB_PG_DISP_LCLS_C      E /* PG_진열대분류코드 */
                 , (SELECT X.POG_YW_NUM AS ISO_STDRD_YW_NUM
                         , X.STR_CD
                         , X.POG_NO
                         , X.STR_DISP_YN
                    FROM TB_PG_STR_POG_L_H X /* PG_매장별POG내역이력 */
                    WHERE X.POG_YW_NUM = TO_CHAR(SYSDATE,'IYYYIW')
                      AND X.STR_CD     = :1
                      AND X.USE_YN     = 'Y'
              ) ST
              WHERE 1=1
                AND A.USE_YN          =  'Y'
                AND A.DISP_SCLS_CD    =  B.DISP_SCLS_CD
                AND D.DISP_MCLS_CD    =  B.DISP_MCLS_CD
                AND E.DISP_LCLS_CD    =  D.DISP_LCLS_CD
                AND A.POG_YW_NUM  = TO_CHAR(SYSDATE,'IYYYIW')
                AND A.USE_YN      = 'Y'
                AND A.POG_STAT_DTL_CD IN ('LLL','LPP','PPP') /* 전체    */
                AND A.POG_YW_NUM  = ST.ISO_STDRD_YW_NUM
                AND A.POG_NO      = ST.POG_NO
                AND EXISTS (SELECT /*+ NO_UNNEST */
                                'X'
                            FROM TB_PG_POG_GDS_B X
                               , (SELECT M.GDS_CD
                                       , NVL(M.PLNNG_ORIG_GDS_CD,'z') AS PLNNG_ORIG_GDS_CD
                                       , NVL(M.RENEW_ORIG_GDS_CD,'z') AS RENEW_ORIG_GDS_CD
                                  FROM TB_MD_GDS_M M /* MD_상품마스터 */
                                  WHERE 1=1
                                    AND M.GDS_CD = :2
                            ) M
                            WHERE X.POG_NO = A.POG_NO
                              AND X.GDS_CD IN (M.GDS_CD, M.PLNNG_ORIG_GDS_CD, M.RENEW_ORIG_GDS_CD)
                  )
              ORDER BY A.POG_DISP_STR_NUM, A.POG_NO
             ) A
            FETCH FIRST 1 ROW ONLY
```

### 10. `dz51btcgxpm51`

```sql
SELECT  /* [CdcardVanDealRcvBtch.sqlx][getPosRcptNo][포스영수증번호조회][Author][YYYY-MM-DD] */
                    POS_NO
                ,   RCPT_NO
                ,   SLBIZ_YMD
          FROM  TB_SC_CDCARD_SAL_L
         WHERE  SLBIZ_YMD BETWEEN TO_CHAR(ADD_MONTHS(TO_DATE(RTRIM(:1 ), 'YYYYMMDD'), -3), 'YYYYMMDD') AND TO_CHAR(ADD_MONTHS(TO_DATE(RTRIM(:2 ), 'YYYYMMDD'), 1), 'YYYYMMDD')
             AND    STR_CD      = RTRIM(:3 )
             AND    CARD_NO = FN_ENCRYPT(RTRIM(:4 ))
             AND    CARD_DEAL_SP_CD = RTRIM(:5 )
             AND    APPRV_NO  = RTRIM(:6 )
             AND    ROWNUM      = 1
```
