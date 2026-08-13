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

async function init() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = "index.html";
    return;
  }
  currentUser = session.user;

  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("full_name, department")
    .eq("id", currentUser.id)
    .single();

  document.getElementById("user-name").textContent = (profile && profile.full_name) || currentUser.email;
  document.getElementById("user-dept").textContent = (profile && profile.department) || "";

  document.getElementById("punch-in").disabled = false;
  document.getElementById("punch-out").disabled = false;

  await refreshStatus();
  await refreshHistory();
}

async function refreshStatus() {
  const { data: logs } = await supabaseClient
    .from("attendance_logs")
    .select("type, created_at")
    .eq("employee_id", currentUser.id)
    .order("created_at", { ascending: false })
    .limit(1);

  const latest = logs && logs[0];
  const working = !!(latest && latest.type === "in");

  const pill = document.getElementById("status-pill");
  document.getElementById("status-text").textContent = working ? "勤務中" : "未出勤";
  pill.classList.toggle("working", working);

  document.getElementById("punch-in").disabled = working;
  document.getElementById("punch-out").disabled = !working;
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

document.getElementById("logout-btn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
});

init();
