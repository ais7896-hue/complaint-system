-- 客訴紀錄資料表 (Cloudflare D1)
CREATE TABLE IF NOT EXISTS customer_complaints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    no TEXT,                             -- 編號 / 序號
    complaint_date TEXT,                 -- 客訴日期 (YYYY-MM-DD)
    form_no TEXT NOT NULL,               -- 客訴單號
    customer_name TEXT NOT NULL,         -- 客戶別
    product_category TEXT,               -- 產品類別
    model_name TEXT NOT NULL,            -- 機種
    shipment_date TEXT,                  -- 出貨日期 (YYYY-MM-DD)
    complaint_type TEXT,                 -- 客訴類型 (外觀不良/尺寸異常/功能失效等)
    anomaly_content TEXT NOT NULL,       -- 異常內容描述
    inspection_qty INTEGER DEFAULT 0,    -- 檢驗數
    defect_qty INTEGER DEFAULT 0,        -- 不良數
    defect_rate REAL DEFAULT 0.00,       -- 不良率 (%)
    responsible_dept TEXT,               -- 責任單位
    root_cause TEXT,                     -- 根本原因分析
    countermeasure TEXT,                 -- 改善對策
    capa TEXT,                           -- 矯正預防措施 (CAPA)
    tracking_confirmation TEXT,          -- 追蹤確認
    is_closed TEXT DEFAULT '未結案',     -- 結案狀態 ('未結案' / '已結案')
    progress_notes TEXT,                 -- 進度說明 / 備註
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_complaints_form_no ON customer_complaints(form_no);
CREATE INDEX IF NOT EXISTS idx_customer_complaints_customer ON customer_complaints(customer_name);
CREATE INDEX IF NOT EXISTS idx_customer_complaints_status ON customer_complaints(is_closed);
