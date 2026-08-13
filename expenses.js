let currentProfile = null;
let rowSeq = 0;

function addRow(date, route, amount) {
  rowSeq += 1;
  const tr = document.createElement("tr");
  tr.dataset.rowId = rowSeq;
  tr.innerHTML = `
    <td><input type="date" class="exp-date" value="${date || ""}"></td>
    <td><input type="text" class="exp-route" placeholder="例：渋谷駅 〜 新宿駅" value="${route || ""}"></td>
    <td><input type="number" class="exp-amount" min="0" step="1" placeholder="0" value="${amount || ""}"></td>
    <td><button type="button" class="exp-remove" title="この行を削除">×</button></td>
  `;
  document.getElementById("exp-body").appendChild(tr);
  tr.querySelector(".exp-remove").addEventListener("click", () => {
    tr.remove();
    updateTotal();
  });
  tr.querySelectorAll("input").forEach((input) => input.addEventListener("input", updateTotal));
}

function updateTotal() {
  let total = 0;
  document.querySelectorAll(".exp-amount").forEach((input) => {
    total += Number(input.value) || 0;
  });
  document.getElementById("exp-total").textContent = "¥" + total.toLocaleString("ja-JP");
}

function collectRows() {
  const rows = [];
  document.querySelectorAll("#exp-body tr").forEach((tr) => {
    const date = tr.querySelector(".exp-date").value;
    const route = tr.querySelector(".exp-route").value.trim();
    const amount = Number(tr.querySelector(".exp-amount").value) || 0;
    if (date || route || amount) rows.push({ date, route, amount });
  });
  return rows;
}

async function init() {
  const ctx = await initPage("expenses");
  if (!ctx) return;
  currentProfile = ctx.profile;

  document.getElementById("exp-month").value = new Date().toISOString().slice(0, 7);

  for (let i = 0; i < 3; i++) addRow();
  updateTotal();
}

document.getElementById("exp-add-row").addEventListener("click", () => addRow());

document.getElementById("exp-export").addEventListener("click", async () => {
  const rows = collectRows();
  if (rows.length === 0) {
    alert("最低1行、日付・区間・金額を入力してください。");
    return;
  }

  const monthVal = document.getElementById("exp-month").value; // "2026-08"
  const monthNum = monthVal ? Number(monthVal.split("-")[1]) : new Date().getMonth() + 1;

  document.getElementById("p-title").textContent = monthNum + "月分交通費";
  document.getElementById("p-name").textContent = (currentProfile && currentProfile.full_name) || "-";
  document.getElementById("p-dept").textContent = (currentProfile && currentProfile.department) || "-";

  let total = 0;
  document.getElementById("p-body").innerHTML = rows
    .map((r) => {
      total += r.amount;
      return `<tr><td>${r.date || "-"}</td><td>${r.route || "-"}</td><td class="p-amount">¥${r.amount.toLocaleString("ja-JP")}</td></tr>`;
    })
    .join("");
  document.getElementById("p-total").textContent = "¥" + total.toLocaleString("ja-JP");

  const printArea = document.getElementById("print-area");
  const canvas = await html2canvas(printArea, { scale: 2 });
  const imgData = canvas.toDataURL("image/png");

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const imgHeight = (canvas.height * pageWidth) / canvas.width;
  pdf.addImage(imgData, "PNG", 0, 0, pageWidth, imgHeight);
  pdf.save(`交通費_${monthVal || monthNum}.pdf`);
});

init();
