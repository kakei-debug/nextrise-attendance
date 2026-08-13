let currentUser = null;
let currentProfile = null;

const STATUS_LABEL = { pending: "申請中", approved: "承認済み", rejected: "却下" };
const STATUS_BADGE = { pending: "badge-pending", approved: "badge-approved", rejected: "badge-rejected" };

async function init() {
  const ctx = await initPage("leave");
  if (!ctx) return;
  currentUser = ctx.user;
  currentProfile = ctx.profile;

  await refreshMySummary();
  await refreshMyLeave();
  await refreshDeptLeave();
}

async function refreshMySummary() {
  const granted = Number((currentProfile && currentProfile.leave_granted_days) || 0);

  const { data: approved } = await supabaseClient
    .from("leave_requests")
    .select("days")
    .eq("employee_id", currentUser.id)
    .eq("status", "approved");

  const used = (approved || []).reduce((sum, r) => sum + Number(r.days), 0);
  const remaining = granted - used;

  document.getElementById("lv-granted").textContent = granted + "日";
  document.getElementById("lv-used").textContent = used + "日";
  document.getElementById("lv-remaining").textContent = remaining + "日";
}

async function refreshMyLeave() {
  const { data: rows, error } = await supabaseClient
    .from("leave_requests")
    .select("start_date, end_date, days, reason, status")
    .eq("employee_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const tbody = document.getElementById("my-leave-body");
  if (error || !rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="hist-empty">申請履歴はありません</td></tr>';
    return;
  }

  tbody.innerHTML = rows
    .map((r) => {
      const period = r.start_date === r.end_date ? r.start_date : `${r.start_date} 〜 ${r.end_date}`;
      const badge = `<span class="badge ${STATUS_BADGE[r.status]}">${STATUS_LABEL[r.status]}</span>`;
      return `<tr><td>${period}</td><td>${r.days}日</td><td>${r.reason || "-"}</td><td>${badge}</td></tr>`;
    })
    .join("");
}

async function refreshDeptLeave() {
  const tbody = document.getElementById("dept-leave-body");
  if (!currentProfile || !currentProfile.department) {
    tbody.innerHTML = '<tr><td colspan="5" class="hist-empty">部署が未設定です</td></tr>';
    return;
  }

  const { data: rows, error } = await supabaseClient
    .from("leave_requests")
    .select("id, employee_id, start_date, end_date, days, status, profiles!leave_requests_employee_id_fkey(full_name)")
    .eq("department", currentProfile.department)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error || !rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="hist-empty">申請はありません</td></tr>';
    return;
  }

  tbody.innerHTML = rows
    .map((r) => {
      const period = r.start_date === r.end_date ? r.start_date : `${r.start_date} 〜 ${r.end_date}`;
      const badge = `<span class="badge ${STATUS_BADGE[r.status]}">${STATUS_LABEL[r.status]}</span>`;
      const name = (r.profiles && r.profiles.full_name) || "-";
      let actions = "";
      if (r.status === "pending" && r.employee_id !== currentUser.id) {
        actions = `<button class="btn-approve" data-id="${r.id}" data-action="approved">承認</button> <button class="btn-reject" data-id="${r.id}" data-action="rejected">却下</button>`;
      }
      return `<tr><td>${name}</td><td>${period}</td><td>${r.days}日</td><td>${badge}</td><td>${actions}</td></tr>`;
    })
    .join("");

  tbody.querySelectorAll("button[data-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      await supabaseClient
        .from("leave_requests")
        .update({ status: action, reviewed_by: currentUser.id, reviewed_at: new Date().toISOString() })
        .eq("id", id);
      await refreshDeptLeave();
      await refreshMyLeave();
      await refreshMySummary();
    });
  });
}

document.getElementById("leave-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("leave-error");
  errorEl.textContent = "";

  const date = document.getElementById("lv-date").value;
  const reason = document.getElementById("lv-reason").value.trim();

  if (!date) {
    errorEl.textContent = "申請予定日を入力してください。";
    return;
  }

  const { error } = await supabaseClient.from("leave_requests").insert({
    employee_id: currentUser.id,
    department: currentProfile.department,
    start_date: date,
    end_date: date,
    days: 1,
    reason,
  });

  if (error) {
    errorEl.textContent = "申請に失敗しました：" + error.message;
    return;
  }

  e.target.reset();
  await refreshMyLeave();
  await refreshDeptLeave();
});

init();
