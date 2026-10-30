// Cloudflare Pages Functions API: /api/complaints
// 資料表: customer_complaints (支援單筆/批次匯入與匯出)

const corsHeaders = {
  "Content-Type": "application/json;charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

// GET: 取得客訴清單（可選全部或最新 100 筆）
export async function onRequestGet(context) {
  try {
    const url = new URL(context.request.url);
    const isAll = url.searchParams.get("all") === "true";
    const query = isAll
      ? "SELECT * FROM customer_complaints ORDER BY id DESC"
      : "SELECT * FROM customer_complaints ORDER BY id DESC LIMIT 100";

    const { results } = await context.env.DB.prepare(query).all();
    return new Response(JSON.stringify(results || []), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}

// POST: 新增一筆或批次匯入客訴紀錄
export async function onRequestPost(context) {
  try {
    const body = await context.request.json();

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
          context.env.DB.prepare(insertSql).bind(
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

      await context.env.DB.batch(statements);
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

    const result = await context.env.DB.prepare(insertSql)
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
export async function onRequestPatch(context) {
  try {
    const data = await context.request.json();
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
    await context.env.DB.prepare(query).bind(...params).run();

    return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
  }
}
