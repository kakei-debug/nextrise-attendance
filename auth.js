// タブ切り替え（ログイン ⇔ 新規登録）
document.querySelectorAll(".auth-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".auth-tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.tab;
    document.getElementById("login-form").hidden = target !== "login";
    document.getElementById("signup-form").hidden = target !== "signup";
  });
});

// パスコード欄は数字のみ・4桁までに制限する
function wirePinInput(inputEl) {
  inputEl.addEventListener("input", () => {
    inputEl.value = inputEl.value.replace(/[^0-9]/g, "").slice(0, 4);
  });
}

// SupabaseのAuthは6文字未満のパスワードを許可しないため、
// 4桁のパスコードを内部的に6文字以上の文字列に変換してから送信する
function pinToPassword(pin) {
  return "NR-" + pin;
}

const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
wirePinInput(document.getElementById("login-pin"));
wirePinInput(document.getElementById("signup-pin"));

// ログイン
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("login-error");
  errorEl.textContent = "";

  const email = document.getElementById("login-email").value.trim();
  const pin = document.getElementById("login-pin").value;
  if (pin.length !== 4) {
    errorEl.textContent = "4桁のパスコードを入力してください。";
    return;
  }

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password: pinToPassword(pin) });
  if (error) {
    errorEl.textContent = "メールアドレスまたはパスコードが正しくありません。";
    return;
  }
  window.location.href = "dashboard.html";
});

// 新規登録
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("signup-error");
  errorEl.textContent = "";
  errorEl.style.color = "";

  const fullName = document.getElementById("signup-name").value.trim();
  const department = document.getElementById("signup-dept").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const pin = document.getElementById("signup-pin").value;

  if (pin.length !== 4) {
    errorEl.textContent = "4桁のパスコードを入力してください。";
    return;
  }

  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password: pinToPassword(pin),
    options: { data: { full_name: fullName, department } },
  });

  if (error) {
    errorEl.textContent = "登録に失敗しました：" + error.message;
    return;
  }

  if (data.session) {
    window.location.href = "dashboard.html";
  } else {
    errorEl.style.color = "#1f8a53";
    errorEl.textContent = "登録が完了しました。ログインしてください。";
    document.querySelector('.auth-tab[data-tab="login"]').click();
  }
});

// すでにログイン済みならダッシュボードへ
supabaseClient.auth.getSession().then(({ data }) => {
  if (data.session) window.location.href = "dashboard.html";
});
