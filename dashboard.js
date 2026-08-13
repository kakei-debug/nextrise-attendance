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

  const monthInput = document.getElementById("hist-month");
  monthInput.value = new Date().toISOString().slice(0, 7);
  monthInput.addEventListener("change", refreshHistory);

  await refreshStatus();
  await refreshHistory();
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
  const monthVal = document.getElementById("hist-month").value; // "2026-08"
  const tbody = document.getElementById("hist-body");
  if (!monthVal) {
    tbody.innerHTML = '<tr><td colspan="3" class="hist-empty">対象月を選択してください</td></tr>';
    return;
  }

  const [y, m] = monthVal.split("-").map(Number);
  const monthStart = new Date(y, m - 1, 1);
  const monthEnd = new Date(y, m, 1);

  const { data: logs, error } = await supabaseClient
    .from("attendance_logs")
    .select("type, created_at")
    .eq("employee_id", currentUser.id)
    .gte("created_at", monthStart.toISOString())
    .lt("created_at", monthEnd.toISOString())
    .order("created_at", { ascending: true });

  if (error || !logs || logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="hist-empty">この月の記録はありません</td></tr>';
    return;
  }

  const byDate = {};
  logs.forEach((log) => {
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

init();
