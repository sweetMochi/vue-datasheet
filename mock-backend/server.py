"""
文件解析服務

接收上傳的文件，解析後以 SSE 逐步回傳抽取到的欄位。
本服務為展示用，回傳的是預先準備的範例資料。
"""

import asyncio
import json
import math
import random
import uuid
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

app = FastAPI(title="文件解析服務")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DOCUMENTS: dict[str, str] = {}

BASIC = "基本資料"
NUTRITION = "營養標示"
LAB = "檢驗結果"
VENDOR = "廠商資訊"

# (群組, 標籤, 可能的值)
FIELD_POOL = [
    (BASIC, "品名", ["經典原味火腿", "煙燻雞胸肉片", "黑胡椒培根"]),
    (BASIC, "英文品名", ["Classic Ham", "Smoked Chicken Breast", "Black Pepper Bacon"]),
    (BASIC, "產品編號", ["TH-2041", "TH-3387", "TH-1120"]),
    (BASIC, "內容量", ["200 公克", "350 公克", "1 公斤"]),
    (BASIC, "淨重", ["198 公克", "347 公克"]),
    (BASIC, "有效日期", ["2027/03/15", "2026/11/30", "2027/01/08"]),
    (BASIC, "製造日期", ["2026/03/15", "2026/05/30"]),
    (BASIC, "批號", ["A26031501", "B26053002"]),
    (BASIC, "保存方式", ["冷藏 7°C 以下", "冷凍 -18°C 以下"]),
    (BASIC, "保存期限", ["18 個月", "24 個月"]),
    (BASIC, "原產地", ["臺灣", "丹麥", "西班牙"]),
    (BASIC, "製造廠", ["桃園廠", "臺南廠"]),
    (NUTRITION, "熱量", ["132 大卡", "168 大卡"]),
    (NUTRITION, "蛋白質", ["12.4 公克", "18.2 公克", "9.7 公克"]),
    (NUTRITION, "脂肪", ["8.1 公克", "3.4 公克", "15.6 公克"]),
    (NUTRITION, "飽和脂肪", ["3.2 公克", "1.1 公克", "6.8 公克"]),
    (NUTRITION, "反式脂肪", ["0 公克"]),
    (NUTRITION, "碳水化合物", ["2.1 公克", "0.5 公克", "4.8 公克"]),
    (NUTRITION, "糖", ["1.2 公克", "0 公克"]),
    (NUTRITION, "膳食纖維", ["0 公克", "0.3 公克"]),
    (NUTRITION, "鈉", ["820 毫克", "1140 毫克", "560 毫克"]),
    (NUTRITION, "鉀", ["210 毫克", "340 毫克"]),
    (NUTRITION, "鈣", ["12 毫克", "8 毫克"]),
    (NUTRITION, "鐵", ["1.2 毫克", "0.8 毫克"]),
    (NUTRITION, "維生素 B1", ["0.42 毫克", "0.18 毫克"]),
    (NUTRITION, "維生素 B2", ["0.15 毫克", "0.09 毫克"]),
    (NUTRITION, "水分", ["62.3 公克", "58.1 公克"]),
    (NUTRITION, "灰分", ["3.1 公克", "2.7 公克"]),
    (LAB, "食品添加物", ["亞硝酸鈉", "抗壞血酸鈉", "多磷酸鹽", "己二烯酸鉀"]),
    (LAB, "防腐劑", ["未檢出", "己二烯酸 0.08 g/kg"]),
    (LAB, "著色劑", ["未使用", "紅麴色素"]),
    (BASIC, "過敏原標示", ["含大豆", "含小麥製品", "本產品含蛋"]),
    (BASIC, "素食標示", ["非素食"]),
    (BASIC, "基因改造標示", ["非基因改造"]),
    (LAB, "生菌數", ["1.2 × 10³ CFU/g", "5.0 × 10² CFU/g"]),
    (LAB, "大腸桿菌群", ["未檢出", "陰性"]),
    (LAB, "金黃色葡萄球菌", ["未檢出"]),
    (LAB, "沙門氏桿菌", ["未檢出"]),
    (LAB, "李斯特菌", ["未檢出"]),
    (LAB, "鉛", ["未檢出", "0.02 ppm"]),
    (LAB, "鎘", ["未檢出"]),
    (LAB, "汞", ["未檢出"]),
    (LAB, "動物用藥殘留", ["未檢出", "符合限量標準"]),
    (LAB, "檢驗方法", ["CNS 10890", "MOHWM0014.02"]),
    (LAB, "檢驗依據", ["食品安全衛生管理法第 17 條", "CNS 國家標準"]),
    (LAB, "檢驗結果", ["符合", "合格"]),
    (LAB, "備註", ["無", "本項目委外檢驗", "數值為三次平均"]),
    (VENDOR, "廠商名稱", ["某某食品股份有限公司"]),
    (VENDOR, "廠商電話", ["02-2345-6789"]),
    (VENDOR, "廠商地址", ["臺北市中山區某某路 100 號"]),
    (VENDOR, "統一編號", ["12345678"]),
    (VENDOR, "工廠登記證號", ["99012345"]),
    (VENDOR, "投保產品責任險", ["是"]),
    (BASIC, "包裝材質", ["PE／PA 複合膜", "PP 塑膠盒"]),
    (BASIC, "包裝方式", ["真空包裝", "充氮包裝"]),
    (BASIC, "食用方式", ["開封後請冷藏並儘速食用", "加熱後食用"]),
    (BASIC, "條碼", ["4712345678901", "4719876543210"]),
    (LAB, "報告編號", ["TR-2026-0813-0042"]),
    (LAB, "採樣日期", ["2026/08/01"]),
    (LAB, "報告日期", ["2026/08/10"]),
]

POOL_VALUES = {label: values for _, label, values in FIELD_POOL}

# 法規必填欄位：一定會出現在結果中，且其中至少一項會是「文件裡沒抽到」
REQUIRED_LABELS = ["品名", "有效日期", "廠商名稱"]

# 出現多個候選答案的機率
CANDIDATE_RATE = 0.15

STAGES = [
    ("接收文件", 5),
    ("辨識版面", 20),
    ("擷取文字", 45),
    ("比對欄位", 70),
]


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _interleave_by_group() -> list[tuple]:
    """輪流取各群組的欄位，讓欄位數少的時候四個群組也都會出現。"""
    buckets: dict[str, list[tuple]] = {}
    for entry in FIELD_POOL:
        buckets.setdefault(entry[0], []).append(entry)

    order, groups, i = [], list(buckets), 0
    while len(order) < len(FIELD_POOL):
        bucket = buckets[groups[i % len(groups)]]
        if bucket:
            order.append(bucket.pop(0))
        i += 1
    return order


POOL_ORDER = _interleave_by_group()


def _make_fields(count: int) -> list[dict]:
    # 依序取用欄位池；超過一輪的標籤加序號，避免出現一模一樣的標籤
    picked = []
    for i in range(count):
        group, label, values = POOL_ORDER[i % len(POOL_ORDER)]
        cycle = i // len(POOL_ORDER)
        display = f"{label}（{cycle + 1}）" if cycle else label
        is_required = cycle == 0 and label in REQUIRED_LABELS
        picked.append((group, display, values, is_required))

    # 保證三個法規必填欄位都在結果裡
    if count >= len(REQUIRED_LABELS):
        present = {p[1] for p in picked}
        spare = [i for i, p in enumerate(picked) if not p[3]]
        random.shuffle(spare)
        for label in REQUIRED_LABELS:
            if label in present or not spare:
                continue
            group, _, values = next(e for e in FIELD_POOL if e[1] == label)
            picked[spare.pop()] = (group, label, values, True)

    # 欄位以文件中出現的順序回傳，同一群組不保證相鄰
    random.shuffle(picked)

    fields = []
    for i, (group, label, values, required) in enumerate(picked):
        if random.random() < 0.3:
            confidence = round(random.uniform(0.31, 0.68), 2)
        else:
            confidence = round(random.uniform(0.82, 0.99), 2)

        field = {
            "id": f"f{i + 1}",
            "label": label,
            "group": group,
            "value": random.choice(values),
            "confidence": confidence,
            "required": required,
            "page": i // 8 + 1,
        }

        # 系統抓到不只一個候選答案時，value 是它的首選
        if len(values) >= 2 and random.random() < CANDIDATE_RATE:
            candidates = random.sample(values, min(3, len(values)))
            field["candidates"] = candidates
            field["value"] = candidates[0]
            field["confidence"] = round(random.uniform(0.31, 0.68), 2)

        fields.append(field)

    # 必填欄位裡挑 1～2 個當作「文件裡沒抽到」
    required_idx = [i for i, f in enumerate(fields) if f["required"]]
    if required_idx:
        missing = random.sample(
            required_idx, random.randint(1, min(2, len(required_idx)))
        )
        for i in missing:
            fields[i]["value"] = ""
            fields[i]["confidence"] = None
            fields[i].pop("candidates", None)

    # 至少要有兩個欄位出現多候選，欄位少的時候才不會整份都沒有
    if count >= 6:
        done = [i for i, f in enumerate(fields) if "candidates" in f]
        spare = [
            i
            for i, f in enumerate(fields)
            if "candidates" not in f
            and f["value"] != ""
            and len(POOL_VALUES.get(f["label"], [])) >= 2
        ]
        random.shuffle(spare)
        while len(done) < 2 and spare:
            i = spare.pop()
            values = POOL_VALUES[fields[i]["label"]]
            candidates = random.sample(values, min(3, len(values)))
            fields[i]["candidates"] = candidates
            fields[i]["value"] = candidates[0]
            fields[i]["confidence"] = round(random.uniform(0.31, 0.68), 2)
            done.append(i)

    return fields


@app.post("/api/documents")
async def upload_document(file: UploadFile = File(...)) -> dict:
    """接收文件並建立一筆解析工作。"""
    await file.read()
    document_id = str(uuid.uuid4())
    DOCUMENTS[document_id] = file.filename or "未命名文件"
    return {"document_id": document_id, "filename": DOCUMENTS[document_id]}


@app.get("/api/documents/{document_id}/extract")
async def extract(
    document_id: str,
    request: Request,
    field_count: int = 18,
    speed: float = 1.0,
    fail_at: int = -1,
) -> StreamingResponse:
    """
    解析文件，以 SSE 回報進度與抽取結果。

    field_count : 回傳的欄位數量
    speed       : 速度倍率
    fail_at     : 於第幾個欄位回傳 error 事件，-1 表示不啟用
    """
    if document_id not in DOCUMENTS:
        raise HTTPException(status_code=404, detail="找不到這份文件")

    if field_count < 1 or field_count > 300:
        raise HTTPException(status_code=400, detail="field_count 請介於 1 到 300")

    if not math.isfinite(speed):
        raise HTTPException(status_code=400, detail="speed 請填有效數值")

    async def event_stream() -> AsyncGenerator[str, None]:
        delay = 1.2 / max(speed, 0.1)

        for stage_name, progress in STAGES:
            if await request.is_disconnected():
                return
            yield _sse("stage", {"stage": stage_name, "progress": progress})
            await asyncio.sleep(delay * random.uniform(0.8, 1.6))

        fields = _make_fields(field_count)
        yield _sse("stage", {"stage": "抽取欄位", "progress": 75, "total": len(fields)})

        for index, field in enumerate(fields):
            if await request.is_disconnected():
                return

            if fail_at >= 0 and index == fail_at:
                yield _sse(
                    "error",
                    {"message": "解析服務暫時無法回應", "code": "UPSTREAM_TIMEOUT"},
                )
                return

            yield _sse("field", field)
            await asyncio.sleep(delay * random.uniform(0.15, 0.5))

        yield _sse(
            "done",
            {"stage": "完成", "progress": 100, "field_count": len(fields)},
        )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}
