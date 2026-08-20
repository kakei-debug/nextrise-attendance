let currentUser = null;
let currentProfile = null;

const STATUS_LABEL = { pending: "申請中", approved: "承認済み", rejected: "却下" };
const STATUS_BADGE = { pending: "badge-pending", approved: "badge-approved", rejected: "badge-rejected" };
const ROLE_LABEL = { admin: "管理者", soumu: "総務", employee: "一般社員" };

function pad(n) {
  return String(n).padStart(2, "0");
}

function combineDateTimeToISO(logDate, timeStr) {
  // Supabase の time 型は "18:30:00" のように秒付きで返るため、
  // "HH:MM" 形式（秒なし）の場合だけ ":00" を補う
  const t = timeStr.length === 5 ? timeStr + ":00" : timeStr;
  return new Date(`${logDate}T${t}`).toISOString();
}

async function init() {
  const ctx = await initPage("admin");
  if (!ctx) return;
  currentUser = ctx.user;
  currentProfile = ctx.profile;

  if (!currentProfile || (currentProfile.role !== "soumu" && currentProfile.role !== "admin")) {
    window.location.href = "dashboard.html";
    return;
  }

  document.getElementById("admin-role-note").textContent =
    currentProfile.role === "admin"
      ? "管理者としてログイン中です。総務の機能に加えて、社員の管理も行えます。"
      : "総務としてログイン中です。";

  document.getElementById("user-admin-card").hidden = currentProfile.role !== "admin";

  await refreshEditRequests();
  await populateEmployeeSelect();
  if (currentProfile.role === "admin") await refreshUserList();
}

let currentAttendanceRows = [];
let currentAttendanceEmployeeName = "";

async function populateEmployeeSelect() {
  const { data: rows, error } = await supabaseClient
    .from("profiles")
    .select("id, full_name, department")
    .order("department");

  const select = document.getElementById("att-employee-select");
  if (error || !rows || rows.length === 0) {
    select.innerHTML = '<option value="">社員が見つかりません</option>';
    return;
  }

  select.innerHTML =
    '<option value="">選択してください</option>' +
    rows
      .map((p) => `<option value="${p.id}">${p.full_name || "-"}（${p.department || "-"}）</option>`)
      .join("");

  document.getElementById("att-month").value = new Date().toISOString().slice(0, 7);

  select.addEventListener("change", refreshEmployeeAttendance);
  document.getElementById("att-month").addEventListener("change", refreshEmployeeAttendance);
}

async function refreshEmployeeAttendance() {
  const select = document.getElementById("att-employee-select");
  const employeeId = select.value;
  const monthVal = document.getElementById("att-month").value;
  const tbody = document.getElementById("att-history-body");

  currentAttendanceRows = [];
  currentAttendanceEmployeeName = select.options[select.selectedIndex] ? select.options[select.selectedIndex].text : "";

  if (!employeeId || !monthVal) {
    tbody.innerHTML = '<tr><td colspan="3" class="hist-empty">社員を選択してください</td></tr>';
    return;
  }

  const [y, m] = monthVal.split("-").map(Number);
  const monthStart = new Date(y, m - 1, 1);
  const monthEnd = new Date(y, m, 1);

  const { data: logs, error } = await supabaseClient
    .from("attendance_logs")
    .select("type, created_at")
    .eq("employee_id", employeeId)
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
    const key = d.toLocaleDateString("sv-SE");
    if (!byDate[key]) byDate[key] = { in: null, out: null };
    if (log.type === "in" && !byDate[key].in) byDate[key].in = d;
    if (log.type === "out") byDate[key].out = d;
  });

  const days = ["日", "月", "火", "水", "木", "金", "土"];
  currentAttendanceRows = Object.keys(byDate)
    .sort()
    .map((key) => {
      const entry = byDate[key];
      return {
        date: key,
        in: entry.in ? pad(entry.in.getHours()) + ":" + pad(entry.in.getMinutes()) : "",
        out: entry.out ? pad(entry.out.getHours()) + ":" + pad(entry.out.getMinutes()) : "",
        weekday: days[new Date(key).getDay()],
      };
    });

  tbody.innerHTML = currentAttendanceRows
    .map((r) => {
      const dateLabel = r.date + "（" + r.weekday + "）";
      return `<tr><td>${dateLabel}</td><td>${r.in || "-"}</td><td>${r.out || "-"}</td></tr>`;
    })
    .join("");
}

document.getElementById("att-csv-export").addEventListener("click", () => {
  if (currentAttendanceRows.length === 0) {
    alert("社員と対象月を選択し、記録がある状態でお試しください。");
    return;
  }
  const monthVal = document.getElementById("att-month").value;
  const lines = ["日付,出勤,退勤"];
  currentAttendanceRows.forEach((r) => {
    lines.push(`${r.date},${r.in},${r.out}`);
  });
  const csv = "\uFEFF" + lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `勤怠_${currentAttendanceEmployeeName}_${monthVal}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById("att-pdf-export").addEventListener("click", async () => {
  if (currentAttendanceRows.length === 0) {
    alert("社員と対象月を選択し、記録がある状態でお試しください。");
    return;
  }
  const monthVal = document.getElementById("att-month").value;
  const monthNum = monthVal ? Number(monthVal.split("-")[1]) : new Date().getMonth() + 1;
  const match = currentAttendanceEmployeeName.match(/^(.*)（(.*)）$/);
  const name = match ? match[1] : currentAttendanceEmployeeName;
  const dept = match ? match[2] : "-";

  document.getElementById("ap-title").textContent = monthNum + "月分勤怠表";
  document.getElementById("ap-name").textContent = name;
  document.getElementById("ap-dept").textContent = dept;
  document.getElementById("ap-body").innerHTML = currentAttendanceRows
    .map((r) => `<tr><td>${r.date}（${r.weekday}）</td><td>${r.in || "-"}</td><td>${r.out || "-"}</td></tr>`)
    .join("");

  const printArea = document.getElementById("att-print-area");
  const canvas = await html2canvas(printArea, { scale: 2 });
  const imgData = canvas.toDataURL("image/png");

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgHeight = (canvas.height * pageWidth) / canvas.width;

  if (imgHeight <= pageHeight) {
    pdf.addImage(imgData, "PNG", 0, 0, pageWidth, imgHeight);
  } else {
    // 1ページに収まらない場合はページを分けて出力する
    let remaining = canvas.height;
    let position = 0;
    const pageCanvasHeight = Math.floor((pageHeight * canvas.width) / pageWidth);
    while (remaining > 0) {
      const sliceHeight = Math.min(pageCanvasHeight, remaining);
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;
      pageCanvas
        .getContext("2d")
        .drawImage(canvas, 0, position, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
      const sliceData = pageCanvas.toDataURL("image/png");
      if (position > 0) pdf.addPage();
      pdf.addImage(sliceData, "PNG", 0, 0, pageWidth, (sliceHeight * pageWidth) / canvas.width);
      position += sliceHeight;
      remaining -= sliceHeight;
    }
  }

  pdf.save(`勤怠_${currentAttendanceEmployeeName}_${monthVal}.pdf`);
});

async function refreshEditRequests() {
  const { data: rows, error } = await supabaseClient
    .from("attendance_edit_requests")
    .select("id, employee_id, log_date, type, requested_time, reason, status, profiles!attendance_edit_requests_employee_id_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(40);

  const tbody = document.getElementById("edit-req-body");
  if (error || !rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="hist-empty">申請はありません</td></tr>';
    return;
  }

  tbody.innerHTML = rows
    .map((r) => {
      const name = (r.profiles && r.profiles.full_name) || "-";
      const badge = `<span class="badge ${STATUS_BADGE[r.status]}">${STATUS_LABEL[r.status]}</span>`;
      const actions =
        r.status === "pending"
          ? `<button class="btn-approve" data-id="${r.id}" data-action="approve">承認</button> <button class="btn-reject" data-id="${r.id}" data-action="reject">却下</button>`
          : "";
      return `<tr><td>${name}</td><td>${r.log_date}</td><td>${r.type === "in" ? "出勤" : "退勤"}</td><td>${r.requested_time}</td><td>${r.reason || "-"}</td><td>${badge}</td><td>${actions}</td></tr>`;
    })
    .join("");

  tbody.querySelectorAll("button[data-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.dataset.id);
      const action = btn.dataset.action;
      const row = rows.find((r) => r.id === id);
      if (!row) return;

      if (action === "approve") {
        const dayStart = new Date(`${row.log_date}T00:00:00`).toISOString();
        const dayEnd = new Date(new Date(dayStart).getTime() + 24 * 60 * 60 * 1000).toISOString();

        await supabaseClient
          .from("attendance_logs")
          .delete()
          .eq("employee_id", row.employee_id)
          .eq("type", row.type)
          .gte("created_at", dayStart)
          .lt("created_at", dayEnd);

        await supabaseClient.from("attendance_logs").insert({
          employee_id: row.employee_id,
          type: row.type,
          created_at: combineDateTimeToISO(row.log_date, row.requested_time),
        });

        await supabaseClient
          .from("attendance_edit_requests")
          .update({ status: "approved", reviewed_by: currentUser.id, reviewed_at: new Date().toISOString() })
          .eq("id", id);
      } else {
        await supabaseClient
          .from("attendance_edit_requests")
          .update({ status: "rejected", reviewed_by: currentUser.id, reviewed_at: new Date().toISOString() })
          .eq("id", id);
      }

      await refreshEditRequests();
    });
  });
}

async function refreshUserList() {
  const { data: rows, error } = await supabaseClient
    .from("profiles")
    .select("id, full_name, email, department, role")
    .order("department");

  const tbody = document.getElementById("user-list-body");
  if (error || !rows || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="hist-empty">社員が見つかりません</td></tr>';
    return;
  }

  tbody.innerHTML = rows
    .map((p) => {
      const isSelf = p.id === currentUser.id;
      const deleteBtn = isSelf
        ? ""
        : `<button class="btn-reject" data-id="${p.id}">削除</button>`;
      return `<tr><td>${p.full_name || "-"}</td><td>${p.email}</td><td>${p.department || "-"}</td><td>${ROLE_LABEL[p.role] || p.role}</td><td>${deleteBtn}</td></tr>`;
    })
    .join("");

  tbody.querySelectorAll("button[data-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("この社員のプロフィールを削除します。よろしいですか？")) return;
      await supabaseClient.from("profiles").delete().eq("id", btn.dataset.id);
      await refreshUserList();
    });
  });
}

init();
