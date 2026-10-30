/**
 * Cloudflare Worker 入口
 * 結合靜態資源 (Assets) 與 /api/complaints 後端端點 (支援單筆/批次匯入與完整匯出)
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

      // GET: 取得客訴清單（可選全部或最新 100 筆）
      if (request.method === "GET") {
        try {
          const isAll = url.searchParams.get("all") === "true";
          const query = isAll
            ? "SELECT * FROM customer_complaints ORDER BY id DESC"
            : "SELECT * FROM customer_complaints ORDER BY id DESC LIMIT 100";

          const { results } = await env.DB.prepare(query).all();
          return new Response(JSON.stringify(results || []), { headers: corsHeaders });
        } catch (err) {
          return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
        }
      }

      // POST: 新增一筆或批次匯入客訴紀錄
      if (request.method === "POST") {
        try {
          const body = await request.json();

          const insertSql = `
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

          // 判斷是否為批次匯入 (陣列格式)
          if (Array.isArray(body)) {
            if (body.length === 0) {
              return new Response(JSON.stringify({ error: "匯入資料不可為空" }), { status: 400, headers: corsHeaders });
            }

            const statements = [];
            for (const item of body) {
              if (!item.form_no || !item.customer_name || !item.model_name || !item.anomaly_content) {
                return new Response(
                  JSON.stringify({ error: `客訴單號「${item.form_no || '未知'}」缺少必填欄位 (單號、客戶、機種、異常內容)` }),
                  { status: 400, headers: corsHeaders }
                );
              }

              let defectRate = null;
              const inspQty = parseInt(item.inspection_qty, 10) || 0;
              const defQty = parseInt(item.defect_qty, 10) || 0;
              if (inspQty > 0) {
                defectRate = parseFloat(((defQty / inspQty) * 100).toFixed(2));
              }

              statements.push(
                env.DB.prepare(insertSql).bind(
                  item.no || null,
                  item.complaint_date || null,
                  item.form_no,
                  item.customer_name,
                  item.product_category || null,
                  item.model_name,
                  item.shipment_date || null,
                  item.complaint_type || null,
                  item.anomaly_content,
                  inspQty,
                  defQty,
                  defectRate,
                  item.responsible_dept || null,
                  item.root_cause || null,
                  item.countermeasure || null,
                  item.capa || null,
                  item.tracking_confirmation || null,
                  item.is_closed || "未結案",
                  item.progress_notes || null
                )
              );
            }

            // D1 批次執行
            await env.DB.batch(statements);
            return new Response(
              JSON.stringify({ success: true, count: statements.length, message: `成功匯入 ${statements.length} 筆資料！` }),
              { headers: corsHeaders }
            );
          }

          // 單筆新增
          if (!body.form_no || !body.customer_name || !body.model_name || !body.anomaly_content) {
            return new Response(
              JSON.stringify({ error: "單號、客戶別、機種、異常內容為必填欄位" }),
              { status: 400, headers: corsHeaders }
            );
          }

          let defectRate = null;
          const inspQty = parseInt(body.inspection_qty, 10) || 0;
          const defQty = parseInt(body.defect_qty, 10) || 0;
          if (inspQty > 0) {
            defectRate = parseFloat(((defQty / inspQty) * 100).toFixed(2));
          }

          const result = await env.DB.prepare(insertSql)
            .bind(
              body.no || null,
              body.complaint_date || null,
              body.form_no,
              body.customer_name,
              body.product_category || null,
              body.model_name,
              body.shipment_date || null,
              body.complaint_type || null,
              body.anomaly_content,
              inspQty,
              defQty,
              defectRate,
              body.responsible_dept || null,
              body.root_cause || null,
              body.countermeasure || null,
              body.capa || null,
              body.tracking_confirmation || null,
              body.is_closed || "未結案",
              body.progress_notes || null
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

    // 靜態資源由 Assets 處理
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("Not Found", { status: 404 });
  },
};
