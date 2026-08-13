function pad(n) {
  return String(n).padStart(2, "0");
}

function updateClock() {
  const now = new Date();
  document.getElementById("clock-time").textContent =
    pad(now.getHours()) + ":" + pad(now.getMinutes()) + ":" + pad(now.getSeconds());
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  document.getElementById("clock-date").textContent =
    now.getFullYear() + "年" + (now.getMonth() + 1) + "月" + now.getDate() + "日（" + days[now.getDay()] + "）";
}
updateClock();
setInterval(updateClock, 1000);

let currentUser = null;

function todayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function init() {
  const ctx = await initPage("dashboard");
  if (!ctx) return;
  currentUser = ctx.user;

  document.getElementById("er-date").value = new Date().toLocaleDateString("sv-SE");

  await refreshStatus();
  await refreshHistory();
  await refreshEditRequests();
}

async function refreshStatus() {
  const { start, end } = todayRange();
  const { data: logs } = await supabaseClient
    .from("attendance_logs")
    .select("type, created_at")
    .eq("employee_id", currentUser.id)
    .gte("created_at", start)
    .lt("created_at", end)
    .order("created_at", { ascending: true });

  const hasIn = !!(logs || []).find((l) => l.type === "in");
  const hasOut = !!(logs || []).find((l) => l.type === "out");
  const working = hasIn && !hasOut;

  const pill = document.getElementById("status-pill");
  const text = document.getElementById("status-text");
  if (working) {
    text.textContent = "勤務中";
  } else if (hasIn && hasOut) {
    text.textContent = "退勤済み";
  } else {
    text.textContent = "未出勤";
  }
  pill.classList.toggle("working", working);

  // 1日1回まで：出勤は既に押していたら押せない、退勤は出勤前か既に押していたら押せない
  document.getElementById("punch-in").disabled = hasIn;
  document.getElementById("punch-out").disabled = !hasIn || hasOut;
}

async function refreshHistory() {
  const { data: logs, error } = await supabaseClient
    .from("attendance_logs")
    .select("type, created_at")
    .eq("employee_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(60);

  const tbody = document.getElementById("hist-body");
  if (error || !logs || logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="hist-empty">記録がありません</td></tr>';
    return;
  }

  const byDate = {};
  logs.slice().reverse().forEach((log) => {
    const d = new Date(log.created_at);
    const key = d.toLocaleDateString("sv-SE"); // YYYY-MM-DD
    if (!byDate[key]) byDate[key] = { in: null, out: null };
    if (log.type === "in" && !byDate[key].in) byDate[key].in = d;
    if (log.type === "out") byDate[key].out = d;
  });

  const days = ["日", "月", "火", "水", "木", "金", "土"];
  const rows = Object.keys(byDate)
    .sort()
    .reverse()
    .slice(0, 10)
    .map((key) => {
      const entry = byDate[key];
      const d = new Date(key);
      const dateLabel = d.getMonth() + 1 + "/" + d.getDate() + "（" + days[d.getDay()] + "）";
      const inLabel = entry.in ? pad(entry.in.getHours()) + ":" + pad(entry.in.getMinutes()) : "-";
      const outLabel = entry.out ? pad(entry.out.getHours()) + ":" + pad(entry.out.getMinutes()) : "-";
      return `<tr><td>${dateLabel}</td><td>${inLabel}</td><td>${outLabel}</td></tr>`;
    });

  tbody.innerHTML = rows.join("");
}

const STATUS_LABEL = { pending: "申請中", approved: "承認済み", rejected: "却下" };
const STATUS_BADGE = { pending: "badge-pending", approved: "badge-approved", rejected: "badge-rejected" };

async function refreshEditRequests() {
  const { data: reqs, error } = await supabaseClient
    .from("attendance_edit_requests")
    .select("log_date, type, requested_time, status")
    .eq("employee_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(10);

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

document.getElementById("punch-in").addEventListener("click", async () => {
  await supabaseClient.from("attendance_logs").insert({ employee_id: currentUser.id, type: "in" });
  await refreshStatus();
  await refreshHistory();
});

document.getElementById("punch-out").addEventListener("click", async () => {
  await supabaseClient.from("attendance_logs").insert({ employee_id: currentUser.id, type: "out" });
  await refreshStatus();
  await refreshHistory();
});

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
