// 認証必須ページ共通の初期化処理
// (dashboard.html / leave.html / expenses.html / admin.html から読み込む)

async function initPage(activePage) {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = "index.html";
    return null;
  }
  const user = session.user;

  const { data: profile } = await supabaseClient
    .from("profiles")
    .select("id, full_name, department, role, leave_granted_days")
    .eq("id", user.id)
    .single();

  const nameEl = document.getElementById("user-name");
  const deptEl = document.getElementById("user-dept");
  if (nameEl) nameEl.textContent = (profile && profile.full_name) || user.email;
  if (deptEl) deptEl.textContent = (profile && profile.department) || "";

  const isManager = profile && (profile.role === "soumu" || profile.role === "admin");
  const adminLink = document.getElementById("nav-admin-link");
  if (adminLink) {
    adminLink.hidden = !isManager;
    adminLink.textContent = profile && profile.role === "admin" ? "管理者メニュー" : "総務メニュー";
  }

  document.querySelectorAll("#nav-menu a[data-page]").forEach((a) => {
    a.classList.toggle("current", a.dataset.page === activePage);
  });

  const toggle = document.getElementById("nav-toggle");
  const menu = document.getElementById("nav-menu");
  if (toggle && menu) {
    toggle.addEventListener("click", () => {
      menu.hidden = !menu.hidden;
    });
    document.addEventListener("click", (e) => {
      if (!menu.hidden && !menu.contains(e.target) && e.target !== toggle) {
        menu.hidden = true;
      }
    });
  }

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await supabaseClient.auth.signOut();
      window.location.href = "index.html";
    });
  }

  return { user, profile };
}

function pad2(n) {
  return String(n).padStart(2, "0");
}
