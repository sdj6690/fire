# BTC Decision App (React + Python API)

네, 가능합니다. 기존 확장 MVP를 **React 웹 프론트엔드**로 전환했습니다.

## 구성
- 백엔드: `server.py` (Python + SQLite)
- 프론트엔드: `frontend/` (React + Vite)
- 빌드 결과물: `web_dist/` (서버가 정적으로 서빙)

## 1) React 프론트 빌드
```bash
cd frontend
npm install
npm run build
```

## 2) API 서버 실행
```bash
cd ..
python3 server.py
```

브라우저 접속: `http://localhost:4173`

> `web_dist`가 있으면 서버가 React 빌드 결과를 우선 서빙합니다.

## 개발 모드(선택)
React만 빠르게 수정하고 싶으면:
```bash
cd frontend
npm run dev
```
(이 경우 Vite 개발 서버 주소를 사용)

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
- 교육/연구용 보조 시스템이며 투자 권유가 아닙니다.
- 실거래 주문 연동은 아직 포함하지 않았습니다.
