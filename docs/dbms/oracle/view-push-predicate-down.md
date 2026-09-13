---
id: view-push-predicate-down
title: "인라인 뷰를 처리하는 방법 두 가지"
sidebar_label: view-push-predicate-down
sidebar_position: 3
date: "2026년 8월 24일"
reading_time: "약 6분"
---
FROM절 안에 위치한 서브쿼리를 Inline View라고 한다.  
일반적인 조인 조건을 직접 걸지 않고 Inline View 형태로 감싸는 주된 목적은 대상 데이터의 모수를 사전에 축소하기 위함이다.  
집계 용도로 활용할 경우 WITH절보다는 Inline View를 선호하는 편인데, 1회성 참조 시 불필요한 PGA 메모리 점유를 방지할 수 있기 때문이다.
