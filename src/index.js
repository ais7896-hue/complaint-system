/**
 * Cloudflare Worker 入口
 * 結合靜態資源 (Assets) 與 /api/complaints 後端端點
 */

const corsHeaders = {
  "Content-Type": "application/json;charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 處理 OPTIONS 預檢請求
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // API 路由: /api/complaints
    if (url.pathname === "/api/complaints") {
      if (!env.DB) {
        return new Response(
          JSON.stringify({ error: "尚未在 Cloudflare 綁定 D1 資料庫 (變數名稱需為 DB)" }),
          { status: 500, headers: corsHeaders }
        );
      }

      // GET: 取得客訴清單（依 ID 倒序，最多取最新 100 筆）
      if (request.method === "GET") {
        try {
          const { results } = await env.DB.prepare(
            "SELECT * FROM customer_complaints ORDER BY id DESC LIMIT 100"
          ).all();
          return new Response(JSON.stringify(results || []), { headers: corsHeaders });
        } catch (err) {
          return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
        }
      }

      // POST: 新增一筆客訴紀錄
      if (request.method === "POST") {
        try {
          const data = await request.json();

          if (!data.form_no || !data.customer_name || !data.model_name || !data.anomaly_content) {
            return new Response(
              JSON.stringify({ error: "單號、客戶別、機種、異常內容為必填欄位" }),
              { status: 400, headers: corsHeaders }
            );
          }

          let defectRate = null;
          const inspQty = parseInt(data.inspection_qty, 10) || 0;
          const defQty = parseInt(data.defect_qty, 10) || 0;
          if (inspQty > 0) {
            defectRate = parseFloat(((defQty / inspQty) * 100).toFixed(2));
          }

          const query = `
            INSERT INTO customer_complaints (
              no, complaint_date, form_no, customer_name, product_category,
              model_name, shipment_date, complaint_type, anomaly_content,
              inspection_qty, defect_qty, defect_rate, responsible_dept,
              root_cause, countermeasure, capa, tracking_confirmation,
              is_closed, progress_notes
            ) VALUES (
              ?, ?, ?, ?, ?,
              ?, ?, ?, ?,
              ?, ?, ?, ?,
              ?, ?, ?, ?,
              ?, ?
            )
          `;

          const result = await env.DB.prepare(query)
            .bind(
              data.no || null,
              data.complaint_date || null,
              data.form_no,
              data.customer_name,
              data.product_category || null,
              data.model_name,
              data.shipment_date || null,
              data.complaint_type || null,
              data.anomaly_content,
              inspQty,
              defQty,
              defectRate,
              data.responsible_dept || null,
              data.root_cause || null,
              data.countermeasure || null,
              data.capa || null,
              data.tracking_confirmation || null,
              data.is_closed || '未結案',
              data.progress_notes || null
            )
            .run();

          return new Response(
            JSON.stringify({ success: true, id: result.meta?.last_row_id }),
            { headers: corsHeaders }
          );
        } catch (err) {
          return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
        }
      }

      // PATCH: 更新結案狀態或備註
      if (request.method === "PATCH") {
        try {
          const data = await request.json();
          if (!data.id) {
            return new Response(JSON.stringify({ error: "缺少紀錄 ID" }), { status: 400, headers: corsHeaders });
          }

          const updates = [];
          const params = [];

          if (data.is_closed !== undefined) {
            updates.push("is_closed = ?");
            params.push(data.is_closed);
          }
          if (data.progress_notes !== undefined) {
            updates.push("progress_notes = ?");
            params.push(data.progress_notes);
          }

          if (updates.length === 0) {
            return new Response(JSON.stringify({ error: "無更新內容" }), { status: 400, headers: corsHeaders });
          }

          const query = `UPDATE customer_complaints SET ${updates.join(", ")} WHERE id = ?`;
          params.push(data.id);
          await env.DB.prepare(query).bind(...params).run();

          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        } catch (err) {
          return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
        }
      }
    }

    // 靜態資源 (HTML / CSS / JS) 由 Cloudflare Assets 自動處理
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  },
};
