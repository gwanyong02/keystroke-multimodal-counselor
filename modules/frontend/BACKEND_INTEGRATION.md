# 백엔드 연동 가이드

## ✅ 완료된 작업

프론트엔드가 이재철(D)의 FastAPI 백엔드와 완전히 연동되었습니다.

### 구현된 기능

1. **세션 관리**
   - 앱 시작 시 백엔드에서 `session_id` (UUID v4) 자동 발급
   - 턴 증가 시 백엔드에 새 턴 생성 요청

2. **멀티모달 데이터 전송**
   - 키스트로크 데이터: `POST /keystrokes`
   - 텍스트 데이터: `POST /text`
   - 침묵 이벤트: `POST /silence`

3. **실시간 통신 (WebSocket)**
   - WebSocket 연결: `/ws/{session_id}`
   - LLM 응답 실시간 수신
   - 전송 트리거/침묵 트리거 전달

---

## 🚀 백엔드 실행 방법

### 1. 백엔드 서버 시작

```bash
cd /path/to/backend
python main.py
```

기본 포트: `http://localhost:8000`

### 2. 프론트엔드 환경 변수 설정

`.env` 파일 생성:

```bash
cp .env.example .env
```

`.env` 파일 내용:

```
VITE_API_URL=http://localhost:8000
```

### 3. 프론트엔드 실행

```bash
pnpm dev
```

---

## 📡 API 엔드포인트 사용 현황

### 세션 관리
- ✅ `POST /sessions` - 세션 생성 (자동 호출)
- ✅ `POST /sessions/{session_id}/turns` - 턴 생성 (메시지 전송 시)
- ⏳ `PATCH /sessions/{session_id}/end` - 세션 종료 (미구현 - 나중에 필요 시)

### 데이터 전송
- ✅ `POST /keystrokes` - raw keystroke events
- ✅ `POST /text` - 최종 텍스트 + 삭제된 텍스트
- ✅ `POST /silence` - 침묵 이벤트
- ⏳ `POST /keystroke-classify` - 키스트로크 분류 (박관용 담당)
- ⏳ `POST /vision` - 비전 데이터 (심인영 담당)

### 실시간 통신
- ✅ `WebSocket /ws/{session_id}` - LLM 응답 수신

---

## 🔄 데이터 흐름

### 메시지 전송 시

```
1. 사용자가 메시지 입력 → 전송 버튼 클릭

2. 프론트엔드가 백엔드로 데이터 전송:
   - POST /keystrokes  (raw keystroke events)
   - POST /text        (final_text + deleted_segments)

3. 프론트엔드가 WebSocket으로 트리거 전송:
   - { type: "send_trigger", turn_id: N }

4. 백엔드가 DB 조회 → 프롬프트 조립 → LLM 호출

5. 백엔드가 WebSocket으로 응답 전송:
   - { type: "llm_response", text: "..." }

6. 프론트엔드가 응답을 채팅창에 표시
```

### 침묵 감지 시

```
1. 8초 이상 입력 없음 → 침묵 모니터 감지

2. 프론트엔드가 백엔드로 데이터 전송:
   - POST /silence  (silence_event)

3. 프론트엔드가 WebSocket으로 트리거 전송:
   - { type: "silence_trigger", turn_id: N }

4. 백엔드가 침묵 프롬프트로 LLM 호출

5. 백엔드가 WebSocket으로 응답 전송

6. 프론트엔드가 침묵 응답을 채팅창에 표시
```

---

## 🧪 테스트 방법

### 1. 백엔드가 꺼져 있을 때
- ✅ Fallback 동작: 로컬 session_id 사용
- ✅ 에러 없이 프론트엔드 계속 작동
- ✅ 콘솔에 경고 메시지 출력

### 2. 백엔드가 켜져 있을 때
- ✅ 세션 자동 생성
- ✅ 데이터 전송 확인 (콘솔 로그)
- ✅ WebSocket 연결 상태 표시 (녹색/빨간색 점)

### 3. 개발자 모드에서 확인
```
URL: http://localhost:5173/?dev=true
```

확인 사항:
- WebSocket 연결 상태 (Connected/Disconnected)
- Session ID (UUID v4 형식)
- Turn ID (숫자로 증가)
- 콘솔에 API 요청/응답 로그

---

## 🐛 트러블슈팅

### WebSocket 연결 실패
```
[WebSocket] Connection closed
```

**원인:** 백엔드 서버가 꺼져 있거나 포트가 다름

**해결:**
1. 백엔드 실행 확인: `python main.py`
2. `.env` 파일의 `VITE_API_URL` 확인
3. 브라우저 콘솔에서 에러 메시지 확인

### 세션 생성 실패
```
[Session] Failed to create backend session
[Session] Using local session ID (backend unavailable)
```

**원인:** 백엔드 `/sessions` 엔드포인트 오류

**해결:**
1. 백엔드 로그 확인
2. 데이터베이스 연결 확인
3. Fallback 모드로 계속 사용 가능

### CORS 에러
```
Access to fetch at 'http://localhost:8000/sessions' ... blocked by CORS policy
```

**원인:** 백엔드 CORS 설정 필요

**해결:** 백엔드에 CORS 미들웨어 추가
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## 📝 다음 단계 (아직 안 된 것)

### 박관용(A) - 키스트로크 분류기 연동
- 프론트엔드는 raw keystroke만 전송
- 박관용의 분류기가 `POST /keystroke-classify`로 분류 결과 전송
- 백엔드가 DB에 저장

### 심인영(C) - 비전 모듈 연동
- 방법 1: 웹캠 스트림 → 비전 모듈 → `POST /vision`
- 방법 2: 비전 모듈이 파일 저장 → 백엔드 file watcher

### 박관용(A) - LLM 파이프라인 실제 구현
- 현재는 STUB (assembled_data만 반환)
- 실제 prompt_assembler + llm_client 연결 필요

---

## ✅ 완료 확인

다음이 모두 작동하면 연동 성공:

1. ✅ 브라우저 콘솔에 `[Session] Backend session created` 로그
2. ✅ WebSocket 상태가 "Connected" (녹색 점)
3. ✅ 메시지 전송 시 콘솔에 API 요청 로그
4. ✅ 8초 침묵 시 침묵 메시지 자동 발송
5. ⏳ LLM 응답 수신 (백엔드 구현 후)

현재는 1-4번까지 완료! 🎉
