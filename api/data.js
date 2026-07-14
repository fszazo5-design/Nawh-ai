// استكمال إدخال عناصر فاتورة المبيعات بعد إصلاح الكود المقطوع
            for (const item of body.items) {
              const itemId = crypto.randomUUID();
              await schema`
                INSERT INTO invoice_items (id, invoice_id, product_id, name, qty, unit_price, discount, total) 
                VALUES (${itemId}, ${invoice.id}, ${item.product_id || null}, ${item.name}, ${item.qty}, ${item.unit_price}, ${item.discount || 0}, ${item.total})
              `;
            }
          }
          return jsonResponse({ success: true, data: invoice }, 201);
        } catch (err) {
          return jsonResponse({ success: false, error: 'DATABASE_ERROR', message: err.message }, 500);
        }
      }

      if (req.method === 'PUT' && id) {
        try {
          const result = await schema`
            UPDATE invoices SET
              customer_id = COALESCE(${body.customer_id ?? null}, customer_id),
              status = COALESCE(${body.status ?? null}, status),
              subtotal = COALESCE(${body.subtotal ?? null}, subtotal),
              discount_amt = COALESCE(${body.discount_amt ?? null}, discount_amt),
              tax_rate = COALESCE(${body.tax_rate ?? null}, tax_rate),
              tax_amt = COALESCE(${body.tax_amt ?? null}, tax_amt),
              total_amount = COALESCE(${body.total_amount ?? null}, total_amount),
              paid_amount = COALESCE(${body.paid_amount ?? null}, paid_amount),
              payment_method = COALESCE(${body.payment_method ?? null}, payment_method),
              notes = COALESCE(${body.notes ?? null}, notes)
            WHERE id = ${id} RETURNING *
          `;
          return jsonResponse({ success: true, data: result[0] });
        } catch (err) {
          return jsonResponse({ success: false, error: 'DATABASE_ERROR', message: err.message }, 500);
        }
      }

      if (req.method === 'DELETE' && id) {
        try {
          await schema`DELETE FROM invoices WHERE id = ${id}`;
          return jsonResponse({ success: true, message: 'تم حذف الفاتورة وجميع بنودها بنجاح وعكس الحسابات تلقائياً' });
        } catch (err) {
          return jsonResponse({ success: false, error: 'DATABASE_ERROR', message: err.message }, 500);
        }
      }
    }

    // ==========================================
    // === [ INVOICE ITEMS ] ===
    // ==========================================
    if (table === 'invoice_items') {
      if (req.method === 'GET') {
        const invoice_id = url.searchParams.get('invoice_id');
        let rows = [];
        if (invoice_id) {
          rows = await schema`SELECT * FROM invoice_items WHERE invoice_id = ${invoice_id} ORDER BY created_at ASC`;
        } else {
          rows = await schema`SELECT * FROM invoice_items ORDER BY created_at DESC`;
        }
        return jsonResponse({ success: true, data: rows });
      }
    }

    // ==========================================
    // === [ PURCHASES ] ===
    // ==========================================
    if (table === 'purchases') {
      if (req.method === 'GET') {
        if (id) {
          const result = await schema`SELECT p.*, s.name as supplier_name FROM purchases p LEFT JOIN suppliers s ON p.supplier_id = s.id WHERE p.id = ${id}`;
          if (result.length === 0) return jsonResponse({ success: false, error: 'NOT_FOUND' }, 404);
          return jsonResponse({ success: true, data: result[0] });
        }
        const result = await schema`SELECT p.*, s.name as supplier_name FROM purchases p LEFT JOIN suppliers s ON p.supplier_id = s.id ORDER BY p.created_at DESC`;
        return jsonResponse({ success: true, data: result });
      }

      if (req.method === 'POST') {
        try {
          const purchase_number = generatePurchaseNumber();
          const purId = crypto.randomUUID();
          
          const purchaseResult = await schema`
            INSERT INTO purchases (id, purchase_number, supplier_id, status, subtotal, discount_amt, tax_amt, total_amount, paid_amount, payment_method, notes)
            VALUES (${purId}, ${purchase_number}, ${body.supplier_id || null}, ${body.status || 'received'}, ${body.subtotal || 0}, ${body.discount_amt || 0}, ${body.tax_amt || 0}, ${body.total_amount || 0}, ${body.paid_amount || 0}, ${body.payment_method || 'cash'}, ${body.notes || null}) RETURNING *
          `;
          const purchase = purchaseResult[0];

          if (body.items && body.items.length > 0) {
            for (const item of body.items) {
              const itemId = crypto.randomUUID();
              await schema`
                INSERT INTO purchase_items (id, purchase_id, product_id, name, qty, unit_cost, total) 
                VALUES (${itemId}, ${purchase.id}, ${item.product_id || null}, ${item.name}, ${item.qty}, ${item.unit_cost}, ${item.total})
              `;
            }
          }
          return jsonResponse({ success: true, data: purchase }, 201);
        } catch (err) {
          return jsonResponse({ success: false, error: 'DATABASE_ERROR', message: err.message }, 500);
        }
      }

      if (req.method === 'PUT' && id) {
        try {
          const result = await schema`
            UPDATE purchases SET
              supplier_id = COALESCE(${body.supplier_id ?? null}, supplier_id),
              status = COALESCE(${body.status ?? null}, status),
              subtotal = COALESCE(${body.subtotal ?? null}, subtotal),
              discount_amt = COALESCE(${body.discount_amt ?? null}, discount_amt),
              tax_amt = COALESCE(${body.tax_amt ?? null}, tax_amt),
              total_amount = COALESCE(${body.total_amount ?? null}, total_amount),
              paid_amount = COALESCE(${body.paid_amount ?? null}, paid_amount),
              payment_method = COALESCE(${body.payment_method ?? null}, payment_method),
              notes = COALESCE(${body.notes ?? null}, notes)
            WHERE id = ${id} RETURNING *
          `;
          return jsonResponse({ success: true, data: result[0] });
        } catch (err) {
          return jsonResponse({ success: false, error: 'DATABASE_ERROR', message: err.message }, 500);
        }
      }

      if (req.method === 'DELETE' && id) {
        try {
          await schema`DELETE FROM purchases WHERE id = ${id}`;
          return jsonResponse({ success: true, message: 'تم حذف فاتورة المشتريات وتصفية بنودها وإعادة ضبط المخزون تلقائياً' });
        } catch (err) {
          return jsonResponse({ success: false, error: 'DATABASE_ERROR', message: err.message }, 500);
        }
      }
    }

    // ==========================================
    // === [ EXPENSES & EXPENSE CATEGORIES ] ===
    // ==========================================
    if (table === 'expenses') {
      if (req.method === 'GET') {
        const result = await schema`SELECT e.*, c.name as category_name FROM expenses e LEFT JOIN expense_categories c ON e.category_id = c.id ORDER BY e.expense_date DESC, e.created_at DESC`;
        return jsonResponse({ success: true, data: result });
      }

      if (req.method === 'POST') {
        try {
          const expId = crypto.randomUUID();
          const result = await schema`
            INSERT INTO expenses (id, category_id, description, amount, paid_by, receipt_url, expense_date)
            VALUES (${expId}, ${body.category_id || null}, ${body.description}, ${body.amount}, ${body.paid_by || null}, ${body.receipt_url || null}, ${body.expense_date || new Date().toISOString().slice(0, 10)}) RETURNING *
          `;
          
          // إدراج مباشر في التدفق النقدي للصادر
          const cfId = crypto.randomUUID();
          await schema`
            INSERT INTO cash_flow (id, type, amount, source_type, reference_id, description)
            VALUES (${cfId}, 'OUT', ${body.amount}, 'expense', ${expId}, 'تسجيل مصروف: ' || ${body.description})
          `;

          return jsonResponse({ success: true, data: result[0] }, 201);
        } catch (err) {
          return jsonResponse({ success: false, error: 'DATABASE_ERROR', message: err.message }, 500);
        }
      }

      if (req.method === 'DELETE' && id) {
        try {
          // استخراج قيمة المصروف المسجل لعكس التدفق المالي
          const targetExpense = await schema`SELECT amount, description FROM expenses WHERE id = ${id}`;
          if (targetExpense.length > 0) {
            const cfId = crypto.randomUUID();
            await schema`
              INSERT INTO cash_flow (id, type, amount, source_type, reference_id, description)
              VALUES (${cfId}, 'IN', ${targetExpense[0].amount}, 'expense_cancelled', ${id}, 'عكس وإلغاء مصروف: ' || ${targetExpense[0].description})
            `;
          }
          await schema`DELETE FROM expenses WHERE id = ${id}`;
          return jsonResponse({ success: true, message: 'تم حذف المصروف وتسوية الخزينة' });
        } catch (err) {
          return jsonResponse({ success: false, error: 'DATABASE_ERROR', message: err.message }, 500);
        }
      }
    }

    if (table === 'expense_categories') {
      if (req.method === 'GET') {
        const rows = await schema`SELECT * FROM expense_categories ORDER BY name ASC`;
        return jsonResponse({ success: true, data: rows });
      }
      if (req.method === 'POST') {
        try {
          const catId = crypto.randomUUID();
          const result = await schema`INSERT INTO expense_categories (id, name) VALUES (${catId}, ${body.name}) ON CONFLICT (name) DO NOTHING RETURNING *`;
          return jsonResponse({ success: true, data: result[0] || { message: 'التصنيف موجود مسبقاً' } }, 201);
        } catch (err) {
          return jsonResponse({ success: false, error: 'DATABASE_ERROR', message: err.message }, 500);
        }
      }
    }

    // ==========================================
    // === [ CASH FLOW & INVENTORY TRANSACTIONS ] ===
    // ==========================================
    if (table === 'cash_flow') {
      if (req.method === 'GET') {
        const type = url.searchParams.get('type');
        let rows = [];
        if (type) {
          rows = await schema`SELECT * FROM cash_flow WHERE type = ${type} ORDER BY created_at DESC`;
        } else {
          rows = await schema`SELECT * FROM cash_flow ORDER BY created_at DESC`;
        }
        return jsonResponse({ success: true, data: rows });
      }
    }

    if (table === 'inventory_transactions') {
      if (req.method === 'GET') {
        const product_id = url.searchParams.get('product_id');
        let rows = [];
        if (product_id) {
          rows = await schema`SELECT t.*, p.name as product_name FROM inventory_transactions t JOIN products p ON t.product_id = p.id WHERE t.product_id = ${product_id} ORDER BY t.created_at DESC`;
        } else {
          rows = await schema`SELECT t.*, p.name as product_name FROM inventory_transactions t JOIN products p ON t.product_id = p.id ORDER BY t.created_at DESC`;
        }
        return jsonResponse({ success: true, data: rows });
      }
    }

    // ==========================================
    // === [ WHATSAPP QUEUE ] ===
    // ==========================================
    if (table === 'whatsapp_queue') {
      if (req.method === 'GET') {
        const status = url.searchParams.get('status') || 'pending';
        const rows = await schema`SELECT * FROM whatsapp_queue WHERE status = ${status} ORDER BY created_at ASC`;
        return jsonResponse({ success: true, data: rows });
      }
      if (req.method === 'POST') {
        const waId = crypto.randomUUID();
        const result = await schema`
          INSERT INTO whatsapp_queue (id, recipient, message, template_name, template_params, created_by)
          VALUES (${waId}, ${body.recipient}, ${body.message}, ${body.template_name || null}, ${JSON.stringify(body.template_params || {})}, ${user?.id || null}) RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] }, 201);
      }
      if (req.method === 'PUT' && id) {
        const result = await schema`
          UPDATE whatsapp_queue SET 
            status = COALESCE(${body.status ?? null}, status),
            error_message = COALESCE(${body.error_message ?? null}, error_message),
            sent_at = CASE WHEN ${body.status} = 'sent' THEN now() ELSE sent_at END
          WHERE id = ${id} RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] });
      }
    }

    // ==========================================
    // === [ USERS & MANAGEMENT ] ===
    // ==========================================
    if (table === 'users') {
      if (req.method === 'GET') {
        const rows = await schema`SELECT id, email, full_name, role, is_active, last_login, created_at FROM users ORDER BY created_at DESC`;
        return jsonResponse({ success: true, data: rows });
      }
      if (req.method === 'POST') {
        try {
          const uId = crypto.randomUUID();
          const result = await schema`
            INSERT INTO users (id, email, password_hash, full_name, role, is_active)
            VALUES (${uId}, ${body.email}, ${body.password_hash}, ${body.full_name || null}, ${body.role || 'user'}, ${body.is_active ?? true}) RETURNING id, email, full_name, role, is_active
          `;
          return jsonResponse({ success: true, data: result[0] }, 201);
        } catch (err) {
          return jsonResponse({ success: false, error: 'DUPLICATE_EMAIL', message: err.message }, 400);
        }
      }
    }

    // ==========================================
    // === [ AUDIT LOG & SYNC QUEUE ] ===
    // ==========================================
    if (table === 'audit_log') {
      if (req.method === 'GET') {
        const rows = await schema`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 100`;
        return jsonResponse({ success: true, data: rows });
      }
      if (req.method === 'POST') {
        const auId = crypto.randomUUID();
        await schema`
          INSERT INTO audit_log (id, user_id, table_name, record_id, action, old_values, new_values, ip_address, user_agent)
          VALUES (${auId}, ${user?.id || null}, ${body.table_name}, ${body.record_id || null}, ${body.action}, ${JSON.stringify(body.old_values || {})}, ${JSON.stringify(body.new_values || {})}, ${body.ip_address || null}, ${body.user_agent || null})
        `;
        return jsonResponse({ success: true, message: 'تم تدوين سجل المراجعة بنجاح' });
      }
    }

    if (table === 'sync_queue') {
      if (req.method === 'GET') {
        const synced = url.searchParams.get('synced') === 'true';
        const rows = await schema`SELECT * FROM sync_queue WHERE synced = ${synced} ORDER BY created_at ASC`;
        return jsonResponse({ success: true, data: rows });
      }
      if (req.method === 'PUT' && id) {
        const result = await schema`
          UPDATE sync_queue SET 
            synced = true, 
            synced_at = now() 
          WHERE id = ${id} RETURNING *
        `;
        return jsonResponse({ success: true, data: result[0] });
      }
    }

    // معالجة حالة إرسال جدول غير معروف
    return jsonResponse({ success: false, error: 'BAD_REQUEST', message: 'الجدول المطلوب غير مدعوم في النظام حالياً' }, 400);

  } catch (globalError) {
    return jsonResponse({ success: false, error: 'SERVER_CRASH', message: globalError.message }, 500);
  }
}

export { handleRequest };
