// Cloudflare Pages Functions: /api/complaints
// 資料表: customer_complaints

const corsHeaders = {
  "Content-Type": "application/json;charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

// GET: 取得客訴清單（依建立時間倒序排序，最多取最新 100 筆）
export async function onRequestGet(context) {
  try {
    const { results } = await context.env.DB.prepare(
      "SELECT * FROM customer_complaints ORDER BY id DESC LIMIT 100"
    ).all();

    return new Response(JSON.stringify(results || []), {
      headers: corsHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

// POST: 新增一筆客訴紀錄
export async function onRequestPost(context) {
  try {
    const data = await context.request.json();

    // 必填欄位檢查
    if (!data.form_no || !data.customer_name || !data.model_name || !data.anomaly_content) {
      return new Response(
        JSON.stringify({ error: "單號、客戶別、機種、異常內容為必填欄位" }),
        { status: 400, headers: corsHeaders }
      );
    }

    // 計算不良率（若有檢驗數且大於 0）
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

    const result = await context.env.DB.prepare(query)
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
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}

// PATCH: 更新結案狀態與進度說明
export async function onRequestPatch(context) {
  try {
    const data = await context.request.json();
    if (!data.id) {
      return new Response(JSON.stringify({ error: "缺少紀錄 ID" }), {
        status: 400,
        headers: corsHeaders,
      });
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
    if (data.root_cause !== undefined) {
      updates.push("root_cause = ?");
      params.push(data.root_cause);
    }
    if (data.countermeasure !== undefined) {
      updates.push("countermeasure = ?");
      params.push(data.countermeasure);
    }
    if (data.capa !== undefined) {
      updates.push("capa = ?");
      params.push(data.capa);
    }

    if (updates.length === 0) {
      return new Response(JSON.stringify({ error: "無更新內容" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const query = `UPDATE customer_complaints SET ${updates.join(", ")} WHERE id = ?`;
    params.push(data.id);

    await context.env.DB.prepare(query).bind(...params).run();

    return new Response(JSON.stringify({ success: true }), {
      headers: corsHeaders,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
}
