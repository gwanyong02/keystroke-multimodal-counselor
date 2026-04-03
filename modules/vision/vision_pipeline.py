"""
Pipeline: OpenCV → MediaPipe (Face Detaction + Head Pose) → ResNet → return JSON 
출력 주기: 0.2초 (1초에 5번 json이 출력)
출력 스펙: interface_spec.md Module 1 참고

- 데이터 비식별화를 위한 원본 프레임은 추론 직후 메모리에서 폐기
- 현재 사용하는 Resnet 모델은 대충 kaggle에 있는 데이터를 통해서 파인튜닝한 모델 가중치를 사용 중
"""

import time
import json
import threading
import numpy as np
import cv2
import mediapipe as mp
import torch
import torch.nn as nn
from torchvision import models, transforms
from PIL import Image

# 감정 레이블
EMOTION_LABELS = ["angry", "fearful", "happy", "neutral", "sad", "surprised"]

# Head Pose 추정용 3D 얼굴 모델 포인트
_FACE_3D_MODEL = np.array([
    [0.0,    0.0,    0.0],     # landmark 1
    [0.0,  -330.0,  -65.0],    # landmark 152
    [-225.0, 170.0, -135.0],   # landmark 226
    [225.0,  170.0, -135.0],   # landmark 446
    [-150.0,-150.0, -125.0],   # landmark 57
    [150.0, -150.0, -125.0],   # landmark 287
], dtype=np.float64)

_LANDMARK_INDICES = [1, 152, 226, 446, 57, 287]


# ResNet 50

class EmotionResNet(nn.Module):
    """
    ResNet50 기반 6-class 안면 감정 분류기
    """

    def __init__(self, num_classes: int = 6):
        super().__init__()
        self.backbone = models.resnet50(weights=None)
        in_features = self.backbone.fc.in_features
        self.backbone.fc = nn.Sequential(
            nn.Dropout(p=0.4),
            nn.Linear(in_features, num_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.backbone(x)


# Vision Pipeline

class VisionPipeline:
    """
    웹캠 스트림을 5fps 주기로 처리하여 interface_spec.md Module 1 형식의 JSON을 출력

    사용 예:
        pipeline = VisionPipeline(model_path="emotion_resnet.pth")
        pipeline.run()                          # 웹캠 실시간
        output = pipeline.process_frame(frame)  # 단일 프레임 처리
    """

    OUTPUT_FPS = 5
    FRAME_INTERVAL = 1.0 / OUTPUT_FPS

    def __init__(self, model_path: str | None = None, device: str | None = None):
        """
        Args:
            model_path: ResNet 가중치 .pth 경로. None이면 랜덤 초기화 (테스트용).
            device: 'cuda' | 'cpu'. None이면 자동 선택.
        """
        self.device = torch.device(
            device if device else ("cuda" if torch.cuda.is_available() else "cpu")
        )

        # MediaPipe Face Mesh
        self._face_mesh = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=False,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )

        # ResNet 감정 분류
        self._model = EmotionResNet(num_classes=len(EMOTION_LABELS)).to(self.device)
        if model_path:
            ckpt = torch.load(model_path, map_location=self.device, weights_only=True)
            # train.py 체크포인트 형식: {"model": state_dict, "labels": [...], ...}
            state = ckpt["model"] if isinstance(ckpt, dict) and "model" in ckpt else ckpt
            # train.py는 flat resnet50을 저장 (backbone. prefix 없음) → 추가
            if not any(k.startswith("backbone.") for k in state):
                state = {"backbone." + k: v for k, v in state.items()}
            self._model.load_state_dict(state)
            print(f"[VisionPipeline] 가중치 로드 완료: {model_path}")
        else:
            print("[VisionPipeline] 경고: model_path 없음 — 랜덤 가중치 (테스트 전용)")
        self._model.eval()

        self._transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406],
                                 std=[0.229, 0.224, 0.225]),
        ])

        # 턴 내 peak 감정 추적 (thread-safe)
        self._peak_emotion: str | None = None
        self._peak_confidence: float = 0.0
        self._peak_detected_at: float | None = None
        self._peak_lock = threading.Lock()

        # 최신 출력 캐시
        self._latest_output: dict | None = None
        self._output_lock = threading.Lock()

    # External API

    def reset_peak(self) -> None:
        """새 턴 시작 시 peak 초기화. 박관용(A) Trigger Evaluator에서 호출."""
        with self._peak_lock:
            self._peak_emotion = None
            self._peak_confidence = 0.0
            self._peak_detected_at = None

    def get_latest(self) -> dict | None:
        """가장 최근 vision_output 반환. 박관용(A) 파이프라인에서 폴링."""
        with self._output_lock:
            return self._latest_output

    def process_frame(self, frame: np.ndarray) -> dict:
        """
        단일 BGR 프레임을 처리하여 vision_output dict를 반환한다.
        원본 프레임은 함수 종료 시 참조 해제된다
        """
        timestamp = round(time.time(), 3)
        h, w = frame.shape[:2]
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # 원본 프레임 즉시 참조 해제
        del frame

        results = self._face_mesh.process(rgb)

        if not results.multi_face_landmarks:
            output = self._make_no_face_output(timestamp)
        else:
            landmarks = results.multi_face_landmarks[0]
            face_crop = self._crop_face(rgb, landmarks, h, w)
            emotion, confidence, emotion_scores = self._classify_emotion(face_crop)
            head_pose = self._estimate_head_pose(landmarks, h, w)
            self._update_peak(emotion, confidence, timestamp)

            output = {
                "timestamp": timestamp,
                "face_detected": True,
                "emotion": emotion,
                "confidence": round(confidence, 4),
                "emotion_scores": {k: round(v, 4) for k, v in emotion_scores.items()},
                "head_pose": head_pose,
                **self._peak_snapshot(),
            }

        del rgb

        with self._output_lock:
            self._latest_output = output

        return output

    def run(self, camera_index: int = 0, output_callback=None) -> None:
        """
        웹캠 메인 루프. 0.2초마다 process_frame을 호출한다.

        Args:
            camera_index: OpenCV 카메라 인덱스 (기본 0)
            output_callback: vision_output dict를 받는 콜백. None이면 stdout JSON 출력.
        """
        cap = cv2.VideoCapture(camera_index)
        if not cap.isOpened():
            raise RuntimeError(f"카메라를 열 수 없습니다 (index={camera_index})")

        print(f"[VisionPipeline] 시작 — device={self.device}, fps={self.OUTPUT_FPS}")
        try:
            while True:
                t0 = time.time()

                ret, frame = cap.read()
                if not ret:
                    print("[VisionPipeline] 프레임 캡처 실패, 재시도...")
                    time.sleep(0.05)
                    continue

                output = self.process_frame(frame)

                if output_callback:
                    output_callback(output) # vision_output dict를 콜백으로 전달 + 필요에 따라 서버로 전송 코드 추가도 가능
                else:
                    print(json.dumps(output, ensure_ascii=False))

                sleep_sec = self.FRAME_INTERVAL - (time.time() - t0)
                if sleep_sec > 0:
                    time.sleep(sleep_sec)

        except KeyboardInterrupt:
            print("[VisionPipeline] 종료")
        finally:
            cap.release()
            self._face_mesh.close()

    # Internal Methods

    def _crop_face(self, rgb: np.ndarray, landmarks, h: int, w: int) -> Image.Image:
        """MediaPipe 랜드마크 bbox + padding으로 얼굴 크롭 → PIL RGB Image"""
        xs = [lm.x * w for lm in landmarks.landmark]
        ys = [lm.y * h for lm in landmarks.landmark]
        pad = 20
        x1 = int(max(min(xs) - pad, 0))
        x2 = int(min(max(xs) + pad, w))
        y1 = int(max(min(ys) - pad, 0))
        y2 = int(min(max(ys) + pad, h))
        return Image.fromarray(rgb[y1:y2, x1:x2])

    def _classify_emotion(self, face_img: Image.Image) -> tuple[str, float, dict]:
        """ResNet으로 감정 분류 → (top_label, top_confidence, scores_dict)"""
        tensor = self._transform(face_img).unsqueeze(0).to(self.device)
        with torch.no_grad():
            probs = torch.softmax(self._model(tensor), dim=1).squeeze().cpu().numpy()

        scores = {label: float(probs[i]) for i, label in enumerate(EMOTION_LABELS)}
        top_idx = int(np.argmax(probs))
        return EMOTION_LABELS[top_idx], float(probs[top_idx]), scores

    def _estimate_head_pose(self, landmarks, h: int, w: int) -> dict:
        """
        MediaPipe 6개 랜드마크 + solvePnP → yaw / pitch / roll (도 단위)
        yaw 양수: 오른쪽, 음수: 왼쪽 / pitch 양수: 위, 음수: 아래
        """
        image_pts = np.array([
            [landmarks.landmark[i].x * w, landmarks.landmark[i].y * h]
            for i in _LANDMARK_INDICES
        ], dtype=np.float64)

        fl = float(w)
        cam = np.array([[fl, 0, w / 2], [0, fl, h / 2], [0, 0, 1]], dtype=np.float64)

        ok, rvec, _ = cv2.solvePnP(
            _FACE_3D_MODEL, image_pts, cam, np.zeros((4, 1)),
            flags=cv2.SOLVEPNP_ITERATIVE,
        )
        if not ok:
            return {"yaw": 0.0, "pitch": 0.0, "roll": 0.0}

        rmat, _ = cv2.Rodrigues(rvec)
        pitch = round(float(np.degrees(np.arcsin(-rmat[2, 0]))), 2)
        yaw   = round(float(np.degrees(np.arctan2(rmat[1, 0], rmat[0, 0]))), 2)
        roll  = round(float(np.degrees(np.arctan2(rmat[2, 1], rmat[2, 2]))), 2)
        return {"yaw": yaw, "pitch": pitch, "roll": roll}

    def _update_peak(self, emotion: str, confidence: float, timestamp: float) -> None:
        with self._peak_lock:
            if confidence > self._peak_confidence:
                self._peak_emotion = emotion
                self._peak_confidence = round(confidence, 4)
                self._peak_detected_at = timestamp

    def _peak_snapshot(self) -> dict:
        with self._peak_lock:
            return {
                "peak_emotion": self._peak_emotion,
                "peak_confidence": self._peak_confidence,
                "peak_detected_at": self._peak_detected_at,
            }

    def _make_no_face_output(self, timestamp: float) -> dict:
        return {
            "timestamp": timestamp,
            "face_detected": False,
            "emotion": None,
            "confidence": None,
            "emotion_scores": None,
            "head_pose": None,
            **self._peak_snapshot(),
        }


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Vision Pipeline 실행")
    parser.add_argument("--model", type=str, default=None, help="ResNet 가중치 .pth 경로")
    parser.add_argument("--camera", type=int, default=0, help="카메라 인덱스 (기본 0)")
    args = parser.parse_args()

    VisionPipeline(model_path=args.model).run(camera_index=args.camera)
