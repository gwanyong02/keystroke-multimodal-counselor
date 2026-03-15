# Interface Specification

> **담당:** 박관용 (A)  
> **최초 작성일:** 2026-03-15  
> **상태:** v0.1 (초안)

각 모듈이 독립적으로 개발될 수 있도록 입출력 형식을 명확히 정의한다. 모든 모듈은 이 문서의 스펙을 준수하여 출력해야 하며, 스펙 변경 시 반드시 이 문서를 먼저 수정하고 팀에 공유한다.

---

## 시스템 데이터 흐름

```
[Frontend (E)]
      |
      |-- 웹캠 스트림 --> [Vision Module (C)] --> vision_output JSON
      |-- 키스트로크 이벤트 --> [Keystroke Logger (D)] --> raw keystroke JSON
                                                               |
                                                    [Keystroke Classifier (A)]
                                                               |
                                                    keystroke_output JSON
[Frontend (E)]
      |
      |-- 텍스트 이벤트 --> [Text Capture (A)] --> text_output JSON

vision_output + keystroke_output + text_output
      |
[Prompt Assembler (A)]
      |
assembled prompt --> [Claude API] --> 상담 응답
```

---

## Module 1 — Vision Output (심인영, C)

### 책임 범위

OpenCV로 캡처한 웹캠 프레임에서 MediaPipe로 얼굴을 감지·크롭하고, ResNet으로 감정을 분류하여 아래 형식의 JSON을 출력한다. 출력 주기는 추후 협의하여 결정한다 (예: 매 턴 종료 시점에 가장 최근 프레임 기준 1회).

### 출력 스펙

```json
{
  "timestamp": 1710234567.123,
  "face_detected": true,
  "emotion": "sad",
  "confidence": 0.72,
  "emotion_scores": {
    "sad": 0.72,
    "angry": 0.10,
    "happy": 0.05,
    "neutral": 0.08,
    "surprised": 0.03,
    "fearful": 0.02
  },
  "head_pose": {
    "yaw": -12.3,
    "pitch": 5.1,
    "roll": 2.0
  }
}
```

### 필드 정의

| 필드 | 타입 | 설명 |
|---|---|---|
| `timestamp` | float | Unix timestamp (초 단위, 소수점 3자리) |
| `face_detected` | bool | 얼굴 감지 여부 |
| `emotion` | string | 최고 확률 감정 레이블 |
| `confidence` | float | `emotion` 필드 감정의 확률값 (0.0 ~ 1.0) |
| `emotion_scores` | object | 전체 감정 클래스별 확률 분포. 합계는 1.0 |
| `head_pose.yaw` | float | 좌우 회전 (도). 양수: 오른쪽, 음수: 왼쪽 |
| `head_pose.pitch` | float | 상하 회전 (도). 양수: 위, 음수: 아래 |
| `head_pose.roll` | float | 기울기 (도) |

### 감정 레이블 목록

`sad`, `angry`, `happy`, `neutral`, `surprised`, `fearful`

### face_detected: false 처리

얼굴이 감지되지 않은 경우 나머지 필드는 모두 `null`로 설정한다.

```json
{
  "timestamp": 1710234567.123,
  "face_detected": false,
  "emotion": null,
  "confidence": null,
  "emotion_scores": null,
  "head_pose": null
}
```

프롬프트 조립 단계에서 `face_detected: false`인 경우 "표정 데이터 없음"으로 처리한다.

---

## Module 2 — Keystroke Logger Raw Output (이재철, D)

### 책임 범위

브라우저에서 사용자의 키 입력 이벤트를 실시간으로 수집하여 아래 형식의 이벤트 배열을 생성한다. 한 턴(사용자가 전송 버튼을 누르기까지)의 이벤트를 하나의 배열로 묶어 박관용(A)의 분류기로 전달한다.

### 출력 스펙

```json
{
  "session_id": "sess_20260315_001",
  "turn_id": 3,
  "events": [
    {
      "type": "keydown",
      "key": "a",
      "timestamp": 1710234560.001,
      "is_delete": false
    },
    {
      "type": "keyup",
      "key": "a",
      "timestamp": 1710234560.087,
      "is_delete": false
    },
    {
      "type": "keydown",
      "key": "Backspace",
      "timestamp": 1710234562.340,
      "is_delete": true
    }
  ]
}
```

### 필드 정의

| 필드 | 타입 | 설명 |
|---|---|---|
| `session_id` | string | 상담 세션 식별자 |
| `turn_id` | int | 해당 세션 내 턴 번호 (1부터 시작) |
| `events[].type` | string | `"keydown"` 또는 `"keyup"` |
| `events[].key` | string | 입력된 키 값 (KeyboardEvent.key 기준) |
| `events[].timestamp` | float | Unix timestamp (초 단위, 소수점 3자리) |
| `events[].is_delete` | bool | Backspace 또는 Delete 키 여부 |

### 파생 피처 (박관용이 분류기 입력으로 계산)

D는 raw 이벤트만 제공하면 된다. 아래 피처 계산은 A의 분류기 전처리 단계에서 수행한다.

| 피처 | 설명 |
|---|---|
| IKI (Inter-Key Interval) | 연속된 keydown 이벤트 사이의 시간 간격 |
| D1U1 | 하나의 키에 대한 keydown → keyup 시간 (dwell time) |
| D1D2 | 연속된 두 키의 keydown → keydown 시간 |
| U1D2 | 이전 키 keyup → 다음 키 keydown 시간 |
| backspace_rate | 전체 키 입력 중 삭제 키 비율 |
| pause_count | IKI > 2초인 구간의 횟수 |

---

## Module 2 — Keystroke Classifier Output (박관용, A)

### 책임 범위

D의 raw keystroke JSON을 입력받아 EmoSurv 학습 분류기로 감정을 추론하고 아래 형식으로 출력한다.

### 출력 스펙

```json
{
  "session_id": "sess_20260315_001",
  "turn_id": 3,
  "emotion": "anxious",
  "confidence": 0.61,
  "avg_iki_ms": 2300.0,
  "backspace_rate": 0.14
}
```

### 필드 정의

| 필드 | 타입 | 설명 |
|---|---|---|
| `session_id` | string | D로부터 전달받은 세션 식별자 |
| `turn_id` | int | D로부터 전달받은 턴 번호 |
| `emotion` | string | 분류기가 예측한 감정 레이블 |
| `confidence` | float | 예측 확률값 (0.0 ~ 1.0) |
| `avg_iki_ms` | float | 평균 IKI (밀리초). 프롬프트에서 "입력 지연 X초"로 변환 |
| `backspace_rate` | float | 삭제 키 비율. 프롬프트에서 망설임 정도 표현에 활용 |

### 감정 레이블 목록

EmoSurv 레이블 기준: `angry`, `happy`, `calm`, `sad`, `neutral`

> **참고:** 비전 모듈(C)의 레이블(`fearful`, `surprised` 포함)과 다르다. 프롬프트 조립 단계에서 A가 통합 처리한다.

---

## Module 3 — Text Output (박관용, A)

### 책임 범위

프론트엔드(E)로부터 실시간 텍스트 이벤트를 수신하여 삭제된 텍스트와 최종 전송 텍스트를 분리 캡처한다.

### 출력 스펙

```json
{
  "session_id": "sess_20260315_001",
  "turn_id": 3,
  "final_text": "그냥 힘들어요",
  "deleted_segments": [
    {
      "text": "죽고 싶어요",
      "deleted_at": 1710234561.200
    },
    {
      "text": "너무 지쳐서",
      "deleted_at": 1710234563.800
    }
  ]
}
```

### 필드 정의

| 필드 | 타입 | 설명 |
|---|---|---|
| `session_id` | string | 세션 식별자 |
| `turn_id` | int | 턴 번호 |
| `final_text` | string | 사용자가 최종 전송한 텍스트 |
| `deleted_segments` | array | 입력 도중 삭제된 텍스트 목록. 없으면 빈 배열 `[]` |
| `deleted_segments[].text` | string | 삭제된 텍스트 내용 |
| `deleted_segments[].deleted_at` | float | 삭제 시점 Unix timestamp |

---

## Prompt Assembler — Input & Output (박관용, A)

### 입력

위 세 모듈의 출력 JSON을 조합하여 프롬프트를 조립한다.

```python
def assemble_prompt(
    vision: dict,       # Module 1 output
    keystroke: dict,    # Module 2 classifier output
    text: dict          # Module 3 output
) -> str:
    ...
```

### Semantic Mapping 규칙

raw 수치를 LLM에 직접 전달하지 않고 심리적 의미 레이블로 변환한다.

**Head pose 변환:**

```python
def interpret_head_pose(yaw: float, pitch: float) -> str:
    if abs(yaw) > 20:
        return "시선 회피 (고개가 옆으로 돌아있음)"
    elif pitch < -15:
        return "고개 숙임 (위축된 자세)"
    else:
        return "정면 응시"
```

임계값(yaw 20도, pitch -15도)은 파일럿 테스트에서 검증 후 보고서에 근거를 명시한다.

**IKI 변환:**

```python
def interpret_iki(avg_iki_ms: float) -> str:
    if avg_iki_ms > 2000:
        return f"입력 지연 {avg_iki_ms / 1000:.1f}초 (긴 망설임)"
    elif avg_iki_ms > 800:
        return f"입력 지연 {avg_iki_ms / 1000:.1f}초 (보통)"
    else:
        return "빠른 입력"
```

임계값(2000ms, 800ms)은 파일럿 테스트에서 검증 후 보고서에 근거를 명시한다.

### 출력 프롬프트 구조

```
[사용자 상태 분석]
표정: {emotion} (신뢰도 {confidence})
시선: {head_pose_label}
타이핑 패턴: {keystroke_emotion} (신뢰도 {keystroke_confidence}), {iki_label}
삭제된 텍스트: "{deleted_text}"
최종 입력: "{final_text}"

사용자가 말하지 못한 감정이 있을 수 있다.
위 신호들을 종합하여 판단하되, 단정하지 말고
공감적으로 탐색하는 방식으로 응답하라.
```

**삭제된 텍스트가 없는 경우:** 해당 줄을 생략한다.  
**face_detected: false인 경우:** "표정: 데이터 없음"으로 대체한다.

### 특수 토큰 (선택적 확장)

현재는 위 텍스트 기반 프롬프트를 기본 방식으로 사용한다. 추후 LoRA 파인튜닝 단계로 전환할 경우 아래 특수 토큰 방식으로 확장을 검토한다.

| 토큰 | 의미 |
|---|---|
| `[PAUSE_2s]` | 2초 이상의 입력 지연 |
| `[BACKSPACE]` | 삭제 이벤트 발생 |
| `[EMOTION:SAD]` | 감정 레이블 삽입 |
| `[GAZE:AVERTED]` | 시선 회피 감지 |

---

## 버전 히스토리

| 버전 | 날짜 | 변경 내용 | 작성자 |
|---|---|---|---|
| v0.1 | 2026-03-15 | 초안 작성 | 박관용 |
