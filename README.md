# BTC Decision App (Expanded MVP)

요청대로 MVP를 확장해서, 단순 기록 도구를 넘어 **전략/리스크 가드레일/복기**를 포함한 실사용 베이스로 구성했습니다.

## 핵심 확장 포인트
- 전략 프로필 관리
  - 전략 이름 + 최소 RR 기준(min RR) 저장
  - 포지션 시작 시 전략 선택 가능
  - 진입 시 RR이 전략 최소 기준보다 낮으면 차단
- 리스크 가드레일
  - 일 손실 한도
  - 연속 손실 제한
  - 동시 OPEN 포지션 제한
  - 차단 사유를 UI에 즉시 표시
- 분석 확장
  - 전체 승률/평균 손익
  - LONG/SHORT 승률 분리
  - 시간대(hourly) 집계 데이터 API 제공

## 실행
```bash
python3 server.py
```
브라우저: `http://localhost:4173`

## 주요 API
- `GET /api/market`
- `GET /api/strategies`
- `POST /api/strategies`
- `GET /api/risk-config`
- `POST /api/risk-config`
- `GET /api/guardrails`
- `GET /api/trades`
- `POST /api/trades`
- `POST /api/trades/{id}/events`
- `POST /api/trades/{id}/close`
- `GET /api/trades/{id}/timeline`
- `GET /api/analytics`

## 주의
- 교육/연구용 보조 시스템입니다. 투자 권유가 아닙니다.
- 실거래 주문 연동(거래소 API 키 주문)은 아직 포함하지 않았습니다.
