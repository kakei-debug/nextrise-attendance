let currentUser = null;

const STATUS_LABEL = { pending: "申請中", approved: "承認済み", rejected: "却下" };
const STATUS_BADGE = { pending: "badge-pending", approved: "badge-approved", rejected: "badge-rejected" };

async function init() {
  const ctx = await initPage("editrequest");
  if (!ctx) return;
  currentUser = ctx.user;

  document.getElementById("er-date").value = new Date().toLocaleDateString("sv-SE");

  await refreshEditRequests();
}

async function refreshEditRequests() {
  const { data: reqs, error } = await supabaseClient
    .from("attendance_edit_requests")
    .select("log_date, type, requested_time, status")
    .eq("employee_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const tbody = document.getElementById("edit-request-body");
  if (error || !reqs || reqs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="hist-empty">申請履歴はありません</td></tr>';
    return;
  }

  tbody.innerHTML = reqs
    .map((r) => {
      const badge = `<span class="badge ${STATUS_BADGE[r.status]}">${STATUS_LABEL[r.status]}</span>`;
      return `<tr><td>${r.log_date}</td><td>${r.type === "in" ? "出勤" : "退勤"}</td><td>${r.requested_time}</td><td>${badge}</td></tr>`;
    })
    .join("");
}

document.getElementById("edit-request-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("edit-request-error");
  errorEl.textContent = "";

  const log_date = document.getElementById("er-date").value;
  const type = document.getElementById("er-type").value;
  const requested_time = document.getElementById("er-time").value;
  const reason = document.getElementById("er-reason").value.trim();

  if (!log_date || !requested_time) {
    errorEl.textContent = "対象日と正しい時刻を入力してください。";
    return;
  }

  const { error } = await supabaseClient.from("attendance_edit_requests").insert({
    employee_id: currentUser.id,
    log_date,
    type,
    requested_time,
    reason,
  });

  if (error) {
    errorEl.textContent = "申請に失敗しました：" + error.message;
    return;
  }

  e.target.reset();
  document.getElementById("er-date").value = new Date().toLocaleDateString("sv-SE");
  await refreshEditRequests();
});

init();
