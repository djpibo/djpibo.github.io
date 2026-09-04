---
id: view-push-predicate-down
title: "인라인 뷰를 처리하는 방법 두 가지"
sidebar_label: view-push-predicate-down
sidebar_position: 3
date: "2026년 8월 24일"
reading_time: "약 6분"
---
FROM절 안에 있는 뷰를 인라인 뷰라고 한다.
일반적인 조인 조건을 사용하지 않고 인라인 뷰 형태로 생성하는 이유는 모수를 미리 줄이려고 하는 의도가 강하다.
집계 용도로 사용할 경우, WITH절보다는 인라인 뷰를 선호하게 되는데 그 이유는 한 번만 사용할 때 불필요한 PGA 낭비를 막을 수 있기 때문이다.
