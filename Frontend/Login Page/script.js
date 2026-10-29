const loginForm = document.querySelector(".login-form");
const employeeIdInput = document.querySelector("#employee-id");
const passwordInput = document.querySelector("#password");
const loginMessage = document.querySelector("#login-message");

const demoPassword = "HELLO WORLD";
const demoAccounts = {
  "POL-1042": "Police",
  "FSL-2076": "FSL",
  "COURT-0312": "Court",
  "ADM-0001": "Admin"
};

function showMessage(text, isSuccess = false) {
  loginMessage.textContent = text;
  loginMessage.classList.toggle("success", isSuccess);
}

// Employee ID and Password Input
document.querySelectorAll("[data-account]").forEach((button) => {
  button.addEventListener("click", () => {
    employeeIdInput.value = button.dataset.account;
    passwordInput.value = demoPassword;

    showMessage("Demo Credentials filled", true);
  });
});

// Authenticate against the local portal backend.
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const employeeId = employeeIdInput.value.trim().toUpperCase();
  const password = passwordInput.value.trim();

  if (!employeeId || !password) {
    showMessage("Enter Employee ID or Password!");
    return;
  }

  const submit = loginForm.querySelector('[type="submit"]');
  submit.disabled = true;
  showMessage("Signing in…");
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employeeId, password })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Sign-in failed.");
    showMessage(`Welcome, ${result.user.name}. Opening your dashboard…`, true);
    window.location.assign("/dashboard");
  } catch (error) {
    showMessage(error instanceof TypeError ? "Portal backend is unavailable. Start it with npm start." : error.message);
    submit.disabled = false;
  }
});

employeeIdInput.addEventListener("input", () => {
  loginMessage.textContent = "";
  loginMessage.classList.remove("success");
});

passwordInput.addEventListener("input", () => {
  loginMessage.textContent = "";
  loginMessage.classList.remove("success");
});
